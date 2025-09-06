import {
  Inject,
  Injectable,
  NotFoundException,
  OnModuleInit,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  AppsService,
  IAppsService,
} from '@waha/apps/app_sdk/services/IAppsService';
import { EngineBootstrap } from '@waha/core/abc/EngineBootstrap';
import { GowsEngineConfigService } from '@waha/core/config/GowsEngineConfigService';
import { WebJSEngineConfigService } from '@waha/core/config/WebJSEngineConfigService';
import { WhatsappSessionGoWSCore } from '@waha/core/engines/gows/session.gows.core';
import { WebhookConductor } from '@waha/core/integrations/webhooks/WebhookConductor';
import { MediaStorageFactory } from '@waha/core/media/MediaStorageFactory';
import { DefaultMap } from '@waha/utils/DefaultMap';
import { getPinoLogLevel, LoggerBuilder } from '@waha/utils/logging';
import { promiseTimeout, sleep } from '@waha/utils/promiseTimeout';
import { complete } from '@waha/utils/reactive/complete';
import { SwitchObservable } from '@waha/utils/reactive/SwitchObservable';
import { PinoLogger } from 'nestjs-pino';
import { Observable, retry, share } from 'rxjs';
import { filter, map } from 'rxjs/operators';

import { WhatsappConfigService } from '../config.service';
import {
  WAHAEngine,
  WAHAEvents,
  WAHASessionStatus,
} from '../structures/enums.dto';
import {
  ProxyConfig,
  SessionConfig,
  SessionDetailedInfo,
  SessionDTO,
  SessionInfo,
} from '../structures/sessions.dto';
import { WebhookConfig } from '../structures/webhooks.config.dto';
import { populateSessionInfo, SessionManager } from './abc/manager.abc';
import { SessionParams, WhatsappSession } from './abc/session.abc';
import { EngineConfigService } from './config/EngineConfigService';
import { WhatsappSessionNoWebCore } from './engines/noweb/session.noweb.core';
import { WhatsappSessionWebJSCore } from './engines/webjs/session.webjs.core';
import { DOCS_URL } from './exceptions';
import { getProxyConfig } from './helpers.proxy';
import { MediaManager } from './media/MediaManager';
import { LocalSessionAuthRepository } from './storage/LocalSessionAuthRepository';
import { LocalStoreCore } from './storage/LocalStoreCore';

export class OnlyDefaultSessionIsAllowed extends UnprocessableEntityException {
  constructor(name: string) {
    const encoded = Buffer.from(name, 'utf-8').toString('base64');
    super(
      `WAHA Core support only 'default' session. You tried to access '${name}' session (base64: ${encoded}). ` +
        `If you want to run more then one WhatsApp account - please get WAHA PLUS version. Check this out: ${DOCS_URL}`,
    );
  }
}

enum SessionStatus {
  REMOVED = 'REMOVED',
  STOPPED = 'STOPPED',
}

@Injectable()
export class SessionManagerCore extends SessionManager implements OnModuleInit {
  SESSION_STOP_TIMEOUT = 3000;

  // Multi-session support: Maps to store multiple sessions
  private sessions: Map<string, WhatsappSession | SessionStatus> = new Map();
  private sessionConfigs: Map<string, SessionConfig> = new Map();
  private sessionStores: Map<string, LocalStoreCore> = new Map();
  private sessionMediaManagers: Map<string, MediaManager> = new Map();
  DEFAULT = 'default';

  protected readonly EngineClass: typeof WhatsappSession;
  protected events2: DefaultMap<WAHAEvents, SwitchObservable<any>>;
  private sessionEvents: Map<string, DefaultMap<WAHAEvents, SwitchObservable<any>>> = new Map();
  protected readonly engineBootstrap: EngineBootstrap;

  constructor(
    config: WhatsappConfigService,
    private engineConfigService: EngineConfigService,
    private webjsEngineConfigService: WebJSEngineConfigService,
    gowsConfigService: GowsEngineConfigService,
    log: PinoLogger,
    private mediaStorageFactory: MediaStorageFactory,
    @Inject(AppsService)
    appsService: IAppsService,
  ) {
    super(log, config, gowsConfigService, appsService);
    
    // Initialize multi-session support
    this.sessions = new Map();
    this.sessionConfigs = new Map();
    this.sessionStores = new Map();
    this.sessionMediaManagers = new Map();
    
    const engineName = this.engineConfigService.getDefaultEngineName();
    this.EngineClass = this.getEngine(engineName);
    this.engineBootstrap = this.getEngineBootstrap(engineName);

    // Global events for backward compatibility
    this.events2 = new DefaultMap<WAHAEvents, SwitchObservable<any>>(
      (key) =>
        new SwitchObservable((obs$) => {
          return obs$.pipe(retry(), share());
        }),
    );
    
    // Session-specific events
    this.sessionEvents = new Map();

    // Initialize default storage for backward compatibility
    this.store = new LocalStoreCore(engineName.toLowerCase());
    this.sessionAuthRepository = new LocalSessionAuthRepository(this.store);
    this.clearStorage().catch((error) => {
      this.log.error({ error }, 'Error while clearing storage');
    });
  }

  protected getEngine(engine: WAHAEngine): typeof WhatsappSession {
    if (engine === WAHAEngine.WEBJS) {
      return WhatsappSessionWebJSCore;
    } else if (engine === WAHAEngine.NOWEB) {
      return WhatsappSessionNoWebCore;
    } else if (engine === WAHAEngine.GOWS) {
      return WhatsappSessionGoWSCore;
    } else {
      throw new NotFoundException(`Unknown whatsapp engine '${engine}'.`);
    }
  }

  private onlyDefault(name: string) {
    // Multi-session support: No longer restrict to default session only
    // All session names are now allowed
    return;
  }

  async beforeApplicationShutdown(signal?: string) {
    // Stop all running sessions
    const runningSessionNames = Array.from(this.sessions.keys()).filter(name => this.isRunning(name));
    await Promise.all(
      runningSessionNames.map(name => this.stop(name, true).catch(err => 
        this.log.warn(`Error stopping session '${name}': ${err}`)
      ))
    );
    this.stopEvents();
    await this.engineBootstrap.shutdown();
  }

  async onApplicationBootstrap() {
    await this.engineBootstrap.bootstrap();
    this.startPredefinedSessions();
  }

  private async clearStorage() {
    const storage = await this.mediaStorageFactory.build(
      'all',
      this.log.logger.child({ name: 'Storage' }),
    );
    await storage.purge();
  }

  //
  // API Methods
  //
  async exists(name: string): Promise<boolean> {
    this.onlyDefault(name);
    return this.sessions.has(name) && this.sessions.get(name) !== SessionStatus.REMOVED;
  }

  isRunning(name: string): boolean {
    this.onlyDefault(name);
    const session = this.sessions.get(name);
    return session !== undefined && session !== SessionStatus.STOPPED && session !== SessionStatus.REMOVED;
  }

  async upsert(name: string, config?: SessionConfig): Promise<void> {
    this.onlyDefault(name);
    this.sessionConfigs.set(name, config || {});
    if (!this.sessions.has(name)) {
      this.sessions.set(name, SessionStatus.STOPPED);
    }
  }

  async start(name: string): Promise<SessionDTO> {
    this.onlyDefault(name);
    
    // Check if session is already running
    if (this.isRunning(name)) {
      throw new UnprocessableEntityException(
        `Session '${name}' is already started.`,
      );
    }
    
    this.log.info({ session: name }, `Starting session...`);
    const logger = this.log.logger.child({ session: name });
    const sessionConfig = this.sessionConfigs.get(name) || {};
    logger.level = getPinoLogLevel(sessionConfig?.debug);
    const loggerBuilder: LoggerBuilder = logger;

    // Create session-specific storage
    const engineName = this.engineConfigService.getDefaultEngineName();
    const sessionStore = new LocalStoreCore(`${engineName.toLowerCase()}-${name}`);
    await sessionStore.init(name);
    this.sessionStores.set(name, sessionStore);

    // Create session-specific media manager
    const storage = await this.mediaStorageFactory.build(
      name,
      loggerBuilder.child({ name: 'Storage' }),
    );
    await storage.init();
    const mediaManager = new MediaManager(
      storage,
      this.config.mimetypes,
      loggerBuilder.child({ name: 'MediaManager' }),
    );
    this.sessionMediaManagers.set(name, mediaManager);

    const webhook = new WebhookConductor(loggerBuilder);
    const proxyConfig = this.getProxyConfig(name);
    const sessionParams: SessionParams = {
      name,
      mediaManager,
      loggerBuilder,
      printQR: this.engineConfigService.shouldPrintQR,
      sessionStore: sessionStore,
      proxyConfig: proxyConfig,
      sessionConfig: sessionConfig,
      ignore: this.ignoreChatsConfig(sessionConfig),
    };
    
    if (this.EngineClass === WhatsappSessionWebJSCore) {
      sessionParams.engineConfig = this.webjsEngineConfigService.getConfig();
    } else if (this.EngineClass === WhatsappSessionGoWSCore) {
      sessionParams.engineConfig = this.gowsConfigService.getConfig();
    }
    
    // Initialize session auth with session-specific repository
    const sessionAuthRepo = new LocalSessionAuthRepository(sessionStore);
    await sessionAuthRepo.init(name);
    
    // Create and store the session
    // @ts-ignore
    const session = new this.EngineClass(sessionParams);
    this.sessions.set(name, session);
    this.updateSession(name);

    // configure webhooks
    const webhooks = this.getWebhooks(name);
    webhook.configure(session, webhooks);

    // Apps
    await this.configureApps(session);

    // start session
    await session.start();
    logger.info('Session has been started.');
    return {
      name: session.name,
      status: session.status,
      config: session.sessionConfig,
    };
  }

  private updateSession(sessionName?: string) {
    if (sessionName) {
      // Update specific session events
      const session = this.sessions.get(sessionName);
      if (!session || typeof session === 'string') {
        return;
      }
      
      const whatsappSession = session as WhatsappSession;
      
      // Create session-specific event map if not exists
      if (!this.sessionEvents.has(sessionName)) {
        this.sessionEvents.set(sessionName, new DefaultMap<WAHAEvents, SwitchObservable<any>>(
          (key) =>
            new SwitchObservable((obs$) => {
              return obs$.pipe(retry(), share());
            }),
        ));
      }
      
      const sessionEventMap = this.sessionEvents.get(sessionName)!;
      
      // Update session-specific events
      for (const eventName in WAHAEvents) {
        const event = WAHAEvents[eventName];
        const stream$ = whatsappSession
          .getEventObservable(event)
          .pipe(map(populateSessionInfo(event, whatsappSession)));
        
        // Update session-specific event stream
        sessionEventMap.get(event).switch(stream$);
        
        // Also update global event stream for backward compatibility
        this.events2.get(event).switch(stream$);
      }
    } else {
      // Update all sessions events (for backward compatibility)
      for (const [name, session] of this.sessions) {
        if (session && typeof session !== 'string') {
          this.updateSession(name);
        }
      }
    }
  }

  getSessionEvent(sessionName: string, event: WAHAEvents): Observable<any> {
    // Return session-specific events if available
    const sessionEventMap = this.sessionEvents.get(sessionName);
    if (sessionEventMap) {
      return sessionEventMap.get(event);
    }
    
    // Fallback to global events filtered by session
    return this.events2.get(event).pipe(
      // Filter events to only return ones from the requested session
      filter((webhook: any) => webhook.session === sessionName)
    );
  }

  async stop(name: string, silent: boolean): Promise<void> {
    this.onlyDefault(name);
    if (!this.isRunning(name)) {
      this.log.debug({ session: name }, `Session is not running.`);
      return;
    }

    this.log.info({ session: name }, `Stopping session...`);
    try {
      const session = this.getSession(name);
      await session.stop();
    } catch (err) {
      this.log.warn(`Error while stopping session '${name}': ${err}`);
      if (!silent) {
        throw err;
      }
    }
    
    this.log.info({ session: name }, `Session has been stopped.`);
    this.sessions.set(name, SessionStatus.STOPPED);
    
    // Clean up session resources
    const sessionStore = this.sessionStores.get(name);
    if (sessionStore) {
      await sessionStore.close().catch(err => 
        this.log.warn(`Error closing session store '${name}': ${err}`)
      );
      this.sessionStores.delete(name);
    }
    
    this.sessionMediaManagers.delete(name);
    this.stopSessionEvents(name);
    this.updateSession(name);
    await sleep(this.SESSION_STOP_TIMEOUT);
  }

  async unpair(name: string) {
    const session = this.sessions.get(name);
    if (!session || typeof session === 'string') {
      return;
    }
    const whatsappSession = session as WhatsappSession;

    this.log.info({ session: name }, 'Unpairing the device from account...');
    await whatsappSession.unpair().catch((err) => {
      this.log.warn(`Error while unpairing from device: ${err}`);
    });
    await sleep(1000);
  }

  async logout(name: string): Promise<void> {
    this.onlyDefault(name);
    
    // Clean session-specific auth repository
    const sessionStore = this.sessionStores.get(name);
    if (sessionStore) {
      const sessionAuthRepo = new LocalSessionAuthRepository(sessionStore);
      await sessionAuthRepo.clean(name);
    } else {
      // Fallback to default repository for backward compatibility
      await this.sessionAuthRepository.clean(name);
    }
  }

  async delete(name: string): Promise<void> {
    this.onlyDefault(name);
    
    // Clean up all session resources
    const sessionStore = this.sessionStores.get(name);
    if (sessionStore) {
      await sessionStore.close().catch(err => 
        this.log.warn(`Error closing session store during delete '${name}': ${err}`)
      );
      this.sessionStores.delete(name);
    }
    
    this.sessionMediaManagers.delete(name);
    this.sessionConfigs.delete(name);
    this.stopSessionEvents(name);
    this.sessions.set(name, SessionStatus.REMOVED);
    this.updateSession(name);
  }

  /**
   * Combine per session and global webhooks
   */
  private getWebhooks(sessionName: string) {
    let webhooks: WebhookConfig[] = [];
    const sessionConfig = this.sessionConfigs.get(sessionName);
    if (sessionConfig?.webhooks) {
      webhooks = webhooks.concat(sessionConfig.webhooks);
    }
    const globalWebhookConfig = this.config.getWebhookConfig();
    if (globalWebhookConfig) {
      webhooks.push(globalWebhookConfig);
    }
    return webhooks;
  }

  /**
   * Get either session's or global proxy if defined
   */
  protected getProxyConfig(sessionName: string): ProxyConfig | undefined {
    const sessionConfig = this.sessionConfigs.get(sessionName);
    if (sessionConfig?.proxy) {
      return sessionConfig.proxy;
    }
    
    const session = this.sessions.get(sessionName);
    if (!session || typeof session === 'string') {
      return undefined;
    }
    
    const sessions = { [sessionName]: session as WhatsappSession };
    return getProxyConfig(this.config, sessions, sessionName);
  }

  getSession(name: string): WhatsappSession {
    this.onlyDefault(name);
    const session = this.sessions.get(name);
    
    if (!session || typeof session === 'string') {
      throw new NotFoundException(
        `We didn't find a session with name '${name}'.\n` +
          `Please start it first by using POST /api/sessions/${name}/start request`,
      );
    }
    return session as WhatsappSession;
  }

  async getSessions(all: boolean): Promise<SessionInfo[]> {
    const sessionInfos: SessionInfo[] = [];
    
    for (const [name, session] of this.sessions) {
      // Skip removed sessions unless 'all' is true
      if (session === SessionStatus.REMOVED && !all) {
        continue;
      }
      
      // Skip stopped sessions unless 'all' is true
      if (session === SessionStatus.STOPPED && !all) {
        continue;
      }
      
      let sessionInfo: SessionInfo;
      
      if (typeof session === 'string') {
        // Session is in string status (STOPPED or REMOVED)
        const config = this.sessionConfigs.get(name);
        sessionInfo = {
          name: name,
          status: session === SessionStatus.STOPPED ? WAHASessionStatus.STOPPED : WAHASessionStatus.FAILED,
          config: config,
          me: null,
        };
      } else {
        // Session is a WhatsappSession instance
        const whatsappSession = session as WhatsappSession;
        const me = whatsappSession?.getSessionMeInfo();
        sessionInfo = {
          name: whatsappSession.name,
          status: whatsappSession.status,
          config: whatsappSession.sessionConfig,
          me: me,
        };
      }
      
      sessionInfos.push(sessionInfo);
    }
    
    return sessionInfos;
  }

  private async fetchEngineInfo(sessionName: string) {
    const session = this.sessions.get(sessionName);
    let engineInfo = {};
    
    if (session && typeof session !== 'string') {
      const whatsappSession = session as WhatsappSession;
      try {
        engineInfo = await promiseTimeout(1000, whatsappSession.getEngineInfo());
      } catch (error) {
        this.log.debug(
          { session: whatsappSession.name, error: `${error}` },
          'Can not get engine info',
        );
      }
      return {
        engine: whatsappSession?.engine,
        ...engineInfo,
      };
    }
    
    return {
      engine: null,
      ...engineInfo,
    };
  }

  async getSessionInfo(name: string): Promise<SessionDetailedInfo | null> {
    this.onlyDefault(name);
    
    if (!this.sessions.has(name)) {
      return null;
    }
    
    const sessions = await this.getSessions(true);
    const session = sessions.find(s => s.name === name);
    
    if (!session) {
      return null;
    }
    
    const engine = await this.fetchEngineInfo(name);
    return { ...session, engine: engine };
  }

  protected stopEvents() {
    // Stop global events
    complete(this.events2);
    
    // Stop all session-specific events
    for (const [sessionName, eventMap] of this.sessionEvents) {
      complete(eventMap);
    }
    this.sessionEvents.clear();
  }
  
  protected stopSessionEvents(sessionName: string) {
    const sessionEventMap = this.sessionEvents.get(sessionName);
    if (sessionEventMap) {
      complete(sessionEventMap);
      this.sessionEvents.delete(sessionName);
    }
  }

  async onModuleInit() {
    await this.init();
  }

  async init() {
    await this.store.init();
    const knex = this.store.getWAHADatabase();
    await this.appsService.migrate(knex);
  }
}
