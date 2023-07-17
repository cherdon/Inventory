import React, { useCallback, useEffect, useRef, useState } from 'react';

import NetInfo from '@react-native-community/netinfo';

import { actions, selectors, useAppDispatch, useAppSelector } from '@app/redux';

// import {
//   clearDBSyncStatus,
//   reportDBSyncStatus,
//   selectDBSyncSettings,
// } from '@app/features/db-sync/manage';
import { PouchDB, useDB } from '@app/db';

import removePasswordFromJSON from '@app/utils/removePasswordFromJSON';

import useLogger from '@app/hooks/useLogger';

import { DBSyncServerEditableData } from './slice';

// import insertTimestampIdRecord from '@app/utils/insertTimestampIdRecord';

// import useDB from '@app/hooks/useDB';

// import { updateV } from './features/db-sync/manage/statusSlice';
// import {
//   selectActiveProfileConfig,
//   selectActiveProfileNameOrThrowError,
// } from './features/profiles';

// const debugLog = console.warn;
// // const debugLog = (_s: string) => {};

// type SyncRef = {
//   sync: PouchDB.Replication.Sync<{}> | null;
//   remoteDB: PouchDB.Database<{}> | null;
//   canceled: boolean;
// };

// const EMPTY_OBJECT: { [k: string]: undefined } = {};
//
//
// PouchDB.activeTasks.add = new Proxy(PouchDB.activeTasks.add, {
//   apply: (target, thisArg, argumentsList) => {
//     const task = argumentsList[0];
//     const id = Reflect.apply(
//       target,
//       PouchDB.activeTasks,
//       [task]
//     );
//     console.warn('Added task', id, task.name, task);
//     return id;
//   },
// });

const BATCH_SIZE = 20;

type ServerData = DBSyncServerEditableData & {
  id: string;
};

type StartSyncReturnObj = {
  cancel: () => void;
};

export default function DBSyncManager() {
  const logger = useLogger('DBSyncManager');
  const dispatch = useAppDispatch();
  const currentProfileUuid = useAppSelector(
    selectors.profiles.currentProfileUuid,
  );
  const dbSyncEnabled = useAppSelector(selectors.dbSync.dbSyncEnabled);
  const servers = useAppSelector(selectors.dbSync.servers);
  const [isNetworkConnected, setIsNetworkConnected] = useState<boolean | null>(
    null,
  );
  const [networkConnectionType, setNetworkConnectionType] = useState('unknown');
  const [isNetworkConnectionExpensive, setIsNetworkConnectionExpensive] =
    useState<boolean | undefined>(false);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(state => {
      const isConnected = state.isConnected;
      const type = state.type;
      const expensive = state.details?.isConnectionExpensive;
      logger.info(
        `Network state changed. Is connected: ${isConnected}, type: ${type}, expensive: ${expensive}.`,
        {
          details: JSON.stringify(state, null, 2),
        },
      );
      setIsNetworkConnected(isConnected);
      setNetworkConnectionType(type);
      setIsNetworkConnectionExpensive(expensive);
    });

    return unsubscribe;
  }, [logger]);

  // const { dbSync: dbSyncConfig } =
  //   useAppSelector(selectActiveProfileConfig) || EMPTY_OBJECT;
  // const syncSettings = useAppSelector(selectDBSyncSettings) || EMPTY_OBJECT;
  // const { loggingEnabled } = syncSettings;
  // // const loggingEnabled = true

  const { db } = useDB();
  // const version = useRef(0);
  const getAuthenticatedRemoteDB = useCallback(
    async (server: ServerData): Promise<PouchDB.Database | null> => {
      const fLogger = logger.for({ function: server.id });
      try {
        const remoteDB = new PouchDB(server.uri, {
          skip_setup: true,
          auth: {
            username: server.username,
            password: server.password,
          },
        });
        // await remoteDB.logIn(server.username, server.password); // Will get error "You are not allowed to access this db", so we use 'auth' on new PouchDB instead.

        // Test if we can access the database
        const dbInfo = await remoteDB.info();
        const session = await remoteDB.getSession();
        // const user = await remoteDB.getUser(server.username); // Will get error 'missing'.
        fLogger.success(`Connect to server "${server.name}" success.`, {
          details: JSON.stringify(
            {
              dbInfo,
              session,
              // user,
            },
            null,
            2,
          ),
        });
        return remoteDB;
      } catch (e) {
        fLogger.error(
          `Connect to server "${server.name}" failed: ${JSON.stringify(e)}.`,
          { error: e, details: JSON.stringify(e, null, 2) },
        );
        const errorName =
          (e && typeof e === 'object' && (e as any).name) ||
          'Unable to connect to server';
        let errorMessage =
          (e && typeof e === 'object' && (e as any).message) ||
          'Unable to connect to server';
        const errorCode = e && typeof e === 'object' && (e as any).code;
        if (errorCode === 'ETIMEDOUT') errorMessage = 'Network timeout';

        dispatch(
          actions.dbSync.updateServerStatus([
            server.id,
            errorCode === 'ETIMEDOUT' ||
            errorName === 'unknown' ||
            errorMessage === 'Network request failed'
              ? 'Offline'
              : 'Error',
          ]),
        );
        dispatch(
          actions.dbSync.setServerLastErrorMessage([server.id, errorMessage]),
        );
        return null;
      }
    },
    [dispatch, logger],
  );

  const _startSync = useCallback(
    (
      localDB: PouchDB.Database,
      remoteDB: PouchDB.Database,
      params: PouchDB.Replication.SyncOptions,
      server: ServerData,
      {
        onChange,
        onComplete,
      }: {
        onChange?: (arg: {
          localDBUpdateSeq?: number | undefined;
          remoteDBUpdateSeq?: number | undefined;
          pushLastSeq?: number;
          pullLastSeq?: number;
        }) => void;
        onComplete?: (arg: {
          localDBUpdateSeq: number | undefined;
          remoteDBUpdateSeq: number | undefined;
          pushLastSeq: number | undefined;
          pullLastSeq: number | undefined;
        }) => void;
      } = {},
    ): PouchDB.Replication.Sync<{}> => {
      const syncHandler = localDB.sync(remoteDB, {
        ...params,
        retry: true,
      });

      const fLogger = logger.for({ function: server.id });

      syncHandler.on('change', async function (info) {
        const { direction } = info;
        const lastSeq = getSeqValue(info.change.last_seq);
        let localDBUpdateSeq;
        let remoteDBUpdateSeq;
        const logDetails1: any = { info, lastSeq };
        const logDetails2: any = {};
        try {
          const localDBInfo = await localDB.info();
          localDBUpdateSeq = getSeqValue(localDBInfo.update_seq);
          logDetails2.localDBInfo = localDBInfo;
          logDetails1.localDBUpdateSeq = localDBUpdateSeq;
        } catch (e) {
          logDetails1.localDBInfoError = e;
        }
        try {
          const remoteDBInfo = await remoteDB.info();
          remoteDBUpdateSeq = getSeqValue(remoteDBInfo.update_seq);
          logDetails2.remoteDBInfo = remoteDBInfo;
          logDetails1.remoteDBUpdateSeq = remoteDBUpdateSeq;
        } catch (e) {
          logDetails1.remoteDBInfoError = e;
        }

        const payload = {
          // Only update the local or remote seq based on the current operation
          ...(direction === 'push' ? { localDBUpdateSeq } : {}),
          ...(direction === 'pull' ? { remoteDBUpdateSeq } : {}),
          [direction === 'push' ? 'pushLastSeq' : 'pullLastSeq']: lastSeq,
        };
        dispatch(actions.dbSync.updateSyncProgress([server.id, payload]));
        if (onChange) onChange(payload);

        fLogger.info('Event: change', {
          details: JSON.stringify({ ...logDetails1, ...logDetails2 }, null, 2),
        });
      });

      syncHandler.on('complete', async function (info) {
        const pushLastSeq = getSeqValue(info?.push?.last_seq);
        const pullLastSeq = getSeqValue(info?.pull?.last_seq);

        let localDBUpdateSeq;
        let remoteDBUpdateSeq;

        const logDetails1: any = { info, pushLastSeq, pullLastSeq };
        const logDetails2: any = {};
        try {
          const localDBInfo = await localDB.info();
          localDBUpdateSeq = getSeqValue(localDBInfo.update_seq);
          logDetails2.localDBInfo = localDBInfo;
          logDetails1.localDBUpdateSeq = localDBUpdateSeq;
        } catch (e) {
          logDetails1.localDBInfoError = e;
        }
        try {
          const remoteDBInfo = await remoteDB.info();
          remoteDBUpdateSeq = getSeqValue(remoteDBInfo.update_seq);
          logDetails2.remoteDBInfo = remoteDBInfo;
          logDetails1.remoteDBUpdateSeq = remoteDBUpdateSeq;
        } catch (e) {
          logDetails1.remoteDBInfoError = e;
        }

        const payload = {
          localDBUpdateSeq,
          remoteDBUpdateSeq,
          pushLastSeq,
          pullLastSeq,
        };
        dispatch(actions.dbSync.updateSyncProgress([server.id, payload]));
        if (onComplete) onComplete(payload);
        fLogger.info('Event: complete', {
          details: JSON.stringify({ ...logDetails1, ...logDetails2 }, null, 2),
        });
      });

      syncHandler.on('paused', function (...args) {
        fLogger.debug('Event: paused', {
          details: JSON.stringify({ args }, null, 2),
        });
      });

      syncHandler.on('active', function (...args) {
        fLogger.debug('Event: active', {
          details: JSON.stringify({ args }, null, 2),
        });
      });

      syncHandler.on('denied', function (err) {
        fLogger.error('Event: denied', {
          err,
          details: JSON.stringify(err, null, 2),
        });
      });

      syncHandler.on('error', function (err) {
        const message = err && typeof err === 'object' && (err as any).message;
        const errorMessage =
          'Error occurred while syncing' + (message ? `: ${message}` : '.');
        fLogger.error(errorMessage + +` [${server.name}]`, {
          err,
          details: JSON.stringify(err, null, 2),
        });
        dispatch(actions.dbSync.updateServerStatus([server.id, 'Error']));
        dispatch(
          actions.dbSync.setServerLastErrorMessage([server.id, errorMessage]),
        );
      });

      return syncHandler;
    },
    [dispatch, logger],
  );

  const startSync = useCallback(
    (localDB: PouchDB.Database, server: ServerData): StartSyncReturnObj => {
      let shouldCancel = false;
      let isStartupSyncSuccess = false;
      let startupSyncHandler: PouchDB.Replication.Sync<{}> | undefined;
      let syncHandler: PouchDB.Replication.Sync<{}> | undefined;
      let initialPushLastSeq: number | undefined;
      let initialPullLastSeq: number | undefined;
      const seqs: {
        localDBUpdateSeq: number | undefined;
        remoteDBUpdateSeq: number | undefined;
        pushLastSeq: number | undefined;
        pullLastSeq: number | undefined;
      } = {
        localDBUpdateSeq: undefined,
        remoteDBUpdateSeq: undefined,
        pushLastSeq: undefined,
        pullLastSeq: undefined,
      };
      const assignSeqs = (payload: {
        localDBUpdateSeq?: number | undefined;
        remoteDBUpdateSeq?: number | undefined;
        pushLastSeq?: number | undefined;
        pullLastSeq?: number | undefined;
      }) => {
        if (typeof payload.localDBUpdateSeq === 'number')
          seqs.localDBUpdateSeq = payload.localDBUpdateSeq;
        if (typeof payload.remoteDBUpdateSeq === 'number')
          seqs.remoteDBUpdateSeq = payload.remoteDBUpdateSeq;
        if (typeof payload.pushLastSeq === 'number')
          seqs.pushLastSeq = payload.pushLastSeq;
        if (typeof payload.pullLastSeq === 'number')
          seqs.pullLastSeq = payload.pullLastSeq;
      };
      const ret = {
        cancel: () => {
          shouldCancel = true;
          startupSyncHandler?.cancel();
          syncHandler?.cancel();
        },
      };
      (async () => {
        try {
          const remoteDB = await getAuthenticatedRemoteDB(server);
          if (!remoteDB) {
            logger.info('Cannot get remote database, skipping.', {
              function: server.id,
            });
            return;
          }
          if (shouldCancel) return;
          dispatch(actions.dbSync.updateServerStatus([server.id, 'Syncing']));
          startupSyncHandler = _startSync(
            localDB,
            remoteDB,
            { live: false, batch_size: BATCH_SIZE },
            server,
            {
              onChange: assignSeqs,
              onComplete: payload => {
                assignSeqs(payload);
                initialPullLastSeq = payload.pushLastSeq;
                initialPullLastSeq = payload.pullLastSeq;
              },
            },
          );
          startupSyncHandler.on('complete', info => {
            if (shouldCancel) return;
            if (
              info.pull?.ok &&
              info.push?.ok &&
              info.pull?.errors.length === 0 &&
              info.push?.errors.length === 0
            ) {
              isStartupSyncSuccess = true;
              const lastSyncedAt = new Date().getTime();
              dispatch(
                actions.dbSync.updateLastSyncedAt([server.id, lastSyncedAt]),
              );
              logger.success('Start-up sync completed', {
                function: server.id,
                details: JSON.stringify({ info, lastSyncedAt }, null, 2),
              });
            } else {
              logger.error('Start-up sync is not complete', {
                function: server.id,
                details: JSON.stringify({ info }, null, 2),
              });
            }
            dispatch(actions.dbSync.updateServerStatus([server.id, 'Online']));
            syncHandler = _startSync(
              localDB,
              remoteDB,
              { live: true, batch_size: BATCH_SIZE },
              server,
              {
                onChange: payload => {
                  assignSeqs(payload);
                  let isPushComplete =
                    seqs.localDBUpdateSeq === seqs.pushLastSeq;
                  let isPullComplete =
                    seqs.remoteDBUpdateSeq === seqs.pullLastSeq;

                  if (isStartupSyncSuccess) {
                    // If no data was added on local/remote, the seq will stay at 0. We need to consider these cases as complete.
                    if (
                      initialPushLastSeq === 0 &&
                      initialPushLastSeq === seqs.pushLastSeq
                    ) {
                      isPushComplete = true;
                    }
                    if (
                      initialPullLastSeq === 0 &&
                      initialPullLastSeq === seqs.pullLastSeq
                    ) {
                      isPullComplete = true;
                    }
                  }

                  if (isPushComplete && isPullComplete) {
                    dispatch(
                      actions.dbSync.updateServerStatus([server.id, 'Online']),
                    );
                    const lastSyncedAt = new Date().getTime();
                    dispatch(
                      actions.dbSync.updateLastSyncedAt([
                        server.id,
                        lastSyncedAt,
                      ]),
                    );
                    logger.success('Sync completed', {
                      function: server.id,
                      details: JSON.stringify({ lastSyncedAt }, null, 2),
                    });
                  } else {
                    dispatch(
                      actions.dbSync.updateServerStatus([server.id, 'Syncing']),
                    );
                  }
                },
              },
            );
          });
        } catch (e) {
          const message = e && typeof e === 'object' && (e as any).message;
          const errorMessage =
            'Unexpected error on starting synchronization' +
            (message ? `: ${message}` : '');
          logger.error(errorMessage, {
            error: e,
            function: server.id,
          });
          dispatch(actions.dbSync.updateServerStatus([server.id, 'Error']));
          dispatch(
            actions.dbSync.setServerLastErrorMessage([server.id, errorMessage]),
          );
        }
      })();
      return ret;
    },
    [_startSync, dispatch, getAuthenticatedRemoteDB, logger],
  );

  useEffect(() => {
    if (!dbSyncEnabled) {
      logger.info('DB sync is not enabled.');
      dispatch(actions.dbSync.updateAllServerStatus('-'));
      return;
    }

    if (!db) {
      logger.warn('Database is not ready!');
      dispatch(actions.dbSync.updateAllServerStatus('-'));
      return;
    }

    if (!isNetworkConnected) {
      logger.info(
        isNetworkConnected === false
          ? 'Device is offline.'
          : 'Network not ready (unknown status).',
      );
      dispatch(actions.dbSync.updateAllServerStatus('Offline'));
      return;
    }

    if (isNetworkConnectionExpensive) {
      // TODO: Skip if expensive network is disabled
    }

    // Need to restart sync if network connection type changes.
    // (connect to local wifi, VPN, etc.)
    networkConnectionType;

    dispatch(actions.dbSync.updateAllServerStatus('Initializing'));

    const allServersCount = servers ? Object.keys(servers).length : 0;
    if (allServersCount <= 0) {
      logger.info('No servers configured, skipping.');
      return;
    }
    const enabledServersEntries = Object.entries(servers).filter(
      ([id, data]) => {
        const enabled = data.enabled;
        if (!enabled) {
          dispatch(actions.dbSync.updateServerStatus([id, 'Disabled']));
        }
        return enabled;
      },
    );
    logger.info(
      `Starting sync for ${enabledServersEntries.length} servers${
        allServersCount !== enabledServersEntries.length
          ? ` (${
              allServersCount - enabledServersEntries.length
            } servers disabled).`
          : ''
      }.`,
      { details: removePasswordFromJSON(JSON.stringify(servers, null, 2)) },
    );

    const syncs = enabledServersEntries.flatMap(([id, server]) => [
      startSync(db, {
        id,
        ...server,
      }),
    ]);

    return () => {
      logger.info('Config updated, cancelling all sync...');

      syncs.forEach(async sync => {
        const { cancel } = sync;
        cancel();
      });
    };
  }, [
    db,
    dbSyncEnabled,
    dispatch,
    isNetworkConnected,
    isNetworkConnectionExpensive,
    logger,
    networkConnectionType,
    servers,
    startSync,
  ]);

  return null;
}

function getSeqValue(v: number | string | undefined): number | undefined {
  if (typeof v === 'number') {
    return v;
  } else if (typeof v === 'string') {
    try {
      const vv = v.split('-');
      const vvv = parseInt(vv[0], 10);
      if (!isNaN(vvv)) return vvv;
      return undefined;
    } catch (e) {
      return undefined;
    }
  } else {
    return undefined;
  }
}

// function getLastSeqInfo(sync: PouchDB.Replication.Sync<{}>): {
//   push: number | null;
//   pull: number | null;
// } {
//   return {
//     push: getSeqValue((sync as any).push),
//     pull: getSeqValue((sync as any).pull),
//   };
// }

// function getReplicateInfo(r: any) {
//   console.warn('rrr', Object.keys(r), !r);
//   if (!r) return {};
//   return {
//     ok: r.ok,
//     start_time: r.start_time,
//     docs_read: r.docs_read,
//     docs_written: r.docs_written,
//     doc_write_failures: r.doc_write_failures,
//     // errors: r.errors,
//     last_seq: r.last_seq,
//     status: r.status,
//     end_time: r.end_time,
//   };
// }

// function getPushPullInfo(sync: PouchDB.Replication.Sync<{}>): {
//   push: unknown;
//   pull: unknown;
// } {
//   console.warn('sss', Object.keys(sync));
//   return {
//     push: getReplicateInfo((sync as any).push),
//     pull: getReplicateInfo((sync as any).pull),
//   };
// }

function startSyncOld(
  syncName: string,
  localDB: PouchDB.Database,
  remoteUri: string,
  remoteUsername: string,
  remotePassword: string,
  serverName: string,
): Promise<[string, SyncRef]> {
  return new Promise(async resolve => {
    try {
      const remoteDB = new PouchDB(remoteUri, {
        skip_setup: true,
      });

      const syncRef: SyncRef = {
        sync: null,
        remoteDB,
        canceled: false,
      };

      resolve([syncName, syncRef]);

      function loginToRemoteDB() {
        remoteDB
          .logIn(remoteUsername, remotePassword)
          .then(response =>
            // Test if we can access the database
            remoteDB
              .allDocs({ limit: 1, include_docs: false })
              .then(() => response),
          )
          .then(response => {
            dispatch(
              reportDBSyncStatus({
                v,
                profileName,
                serverName,
                type,
                status: 'Online',
              }),
            );
            startStartupSync();
            if (loggingEnabled) {
              insertTimestampIdRecord(logsDB, {
                type: 'db_sync',
                timestamp: new Date().getTime(),
                event: 'login',
                server: syncName,
                ok: true,
                raw: JSON.stringify(response)?.slice(0, 8000),
              });
            }
          })
          .catch((e: any) => {
            switch (e?.error) {
              case 'unauthorized':
                dispatch(
                  reportDBSyncStatus({
                    v,
                    profileName,
                    serverName,
                    type,
                    status: 'Auth Error',
                    message: e.reason,
                  }),
                );
                break;
              case 'not_found':
                dispatch(
                  reportDBSyncStatus({
                    v,
                    profileName,
                    serverName,
                    type,
                    status: 'Config Error',
                    message: e.reason,
                  }),
                );
                break;
              default:
                if (e?.code === 'ETIMEDOUT') {
                  dispatch(
                    reportDBSyncStatus({
                      v,
                      profileName,
                      serverName,
                      type,
                      status: 'Offline',
                      message: JSON.stringify(e)?.slice(0, 8000),
                    }),
                  );
                } else if (e?.status === 0) {
                  dispatch(
                    reportDBSyncStatus({
                      v,
                      profileName,
                      serverName,
                      type,
                      status: 'Offline',
                      message: JSON.stringify(e)?.slice(0, 8000),
                    }),
                  );
                } else {
                  dispatch(
                    reportDBSyncStatus({
                      v,
                      profileName,
                      serverName,
                      type,
                      status: 'Config Error',
                      message:
                        e?.reason ||
                        `Cannot connect to server: ${JSON.stringify(e)?.slice(
                          0,
                          8000,
                        )}.`,
                    }),
                  );
                }
                break;
            }
            if (loggingEnabled) {
              insertTimestampIdRecord(logsDB, {
                type: 'db_sync',
                timestamp: new Date().getTime(),
                event: 'login',
                server: syncName,
                ok: false,
                raw: JSON.stringify(e)?.slice(0, 8000),
              });
            }
          });
      }

      loginToRemoteDB();

      function addSyncEventListeners(
        sync: PouchDB.Replication.Sync<{}>,
        { live }: { live: boolean },
      ) {
        sync
          .on('complete', function (result) {
            if (live || syncRef.canceled) {
              dispatch(
                reportDBSyncStatus({
                  v,
                  profileName,
                  serverName,
                  type,
                  status: 'Offline',
                }),
              );
            } else {
              dispatch(
                reportDBSyncStatus({
                  v,
                  profileName,
                  serverName,
                  type,
                  status: 'Success',
                }),
              );
              startLiveSync();
            }

            if (loggingEnabled) {
              insertTimestampIdRecord(logsDB, {
                type: 'db_sync',
                timestamp: new Date().getTime(),
                event: 'complete',
                server: syncName,
                live,
                canceled: syncRef.canceled,
                ok: result.pull?.ok !== false && result.push?.ok !== false,
                raw: JSON.stringify(result)?.slice(0, 8000),
                ...result,
              });
            }
          })
          .on('change', function (result) {
            if (live) {
              dispatch(
                reportDBSyncStatus({
                  v,
                  profileName,
                  serverName,
                  type,
                  status: 'Success',
                }),
              );
            }
            // debugLog(
            //   `[DB Sync - ${syncName}] change synced: ${JSON.stringify(
            //     result,
            //   )?.slice(0, 8000)}`,
            // );
            if (loggingEnabled) {
              const {
                change: { docs: _d, ...chg },
                ...res
              } = result;
              const resultWithoutDocs = { ...res, change: chg };
              insertTimestampIdRecord(logsDB, {
                type: 'db_sync',
                timestamp: new Date().getTime(),
                event: 'change',
                server: syncName,
                live,
                ok: result.change.ok,
                raw: JSON.stringify(result)?.slice(0, 8000),
                ...resultWithoutDocs,
              });
            }
          })
          .on('error', function (e) {
            if (live) {
              dispatch(
                reportDBSyncStatus({
                  v,
                  profileName,
                  serverName,
                  type,
                  status: 'Error',
                  message: JSON.stringify(e)?.slice(0, 8000),
                }),
              );
              debugLog(
                `[DB Sync - ${syncName}] sync error: ${JSON.stringify(e)?.slice(
                  0,
                  8000,
                )}`,
              );
            } else {
              // TODO: Handle other errors
              dispatch(
                reportDBSyncStatus({
                  v,
                  profileName,
                  serverName,
                  type,
                  status: 'Offline',
                  message: JSON.stringify(e)?.slice(0, 8000),
                }),
              );
              setTimeout(startStartupSync, 5000);
            }
            if (loggingEnabled) {
              insertTimestampIdRecord(logsDB, {
                type: 'db_sync',
                timestamp: new Date().getTime(),
                event: 'error',
                server: syncName,
                live,
                ok: false,
                raw: JSON.stringify(e)?.slice(0, 8000),
              });
            }
          })
          .on('paused', async function (e) {
            // dispatch(
            //   reportDBSyncStatus({
            //     profileName,
            //     serverName,
            //     type,
            //     status: 'Success',
            //   }),
            // );
            // debugLog(
            //   `[DB Sync - ${syncName}] sync error: ${JSON.stringify(
            //     e,
            //   )?.slice(0, 8000)}`,
            // );
            if (loggingEnabled) {
              insertTimestampIdRecord(logsDB, {
                type: 'db_sync',
                timestamp: new Date().getTime(),
                event: 'paused',
                server: syncName,
                live,
                raw: JSON.stringify(e)?.slice(0, 8000),
                ok: !e,
              });
            }
          })
          .on('active', function () {
            dispatch(
              reportDBSyncStatus({
                v,
                profileName,
                serverName,
                type,
                status: 'Syncing',
              }),
            );
            // debugLog(
            //   `[DB Sync - ${syncName}] sync error: ${JSON.stringify(e)?.slice(
            //     0,
            //     8000,
            //   )}`,
            // );
            if (loggingEnabled) {
              insertTimestampIdRecord(logsDB, {
                type: 'db_sync',
                timestamp: new Date().getTime(),
                event: 'active',
                server: syncName,
                live,
              });
            }
          })
          .on('denied', function (e) {
            // debugLog(
            //   `[DB Sync - ${syncName}] sync error: ${JSON.stringify(
            //     e,
            //   )?.slice(0, 8000)}`,
            // );
            if (loggingEnabled) {
              insertTimestampIdRecord(logsDB, {
                type: 'db_sync',
                timestamp: new Date().getTime(),
                event: 'denied',
                server: syncName,
                live,
                raw: JSON.stringify(e)?.slice(0, 8000),
              });
            }
          });

        return sync;
      }

      function startStartupSync() {
        if (syncRef.sync) syncRef.sync.cancel();
        if (syncRef.canceled) return;

        dispatch(
          reportDBSyncStatus({
            v,
            profileName,
            serverName,
            type,
            status: 'Syncing',
          }),
        );

        syncRef.sync = addSyncEventListeners(localDB.sync(remoteDB), {
          live: false,
        });
      }

      function startLiveSync() {
        if (syncRef.sync) syncRef.sync.cancel();
        if (syncRef.canceled) return;

        syncRef.sync = addSyncEventListeners(
          localDB.sync(remoteDB, {
            live: true,
            retry: true,
          }),
          { live: true },
        );

        setTimeout(startStartupSync, 1000 * 60 * 30);
      }
    } catch (e: any) {
      // TODO: Handle unknown error
    }
  });
}
