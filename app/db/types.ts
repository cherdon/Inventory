import type { DataType } from './schema';

export type ConfigStoredInDB = {
  epcCompanyPrefix: string;
  rfidTagAccessPassword: string;
  rfidTagAccessPasswordEncoding: string;
  epcPrefix: number;
};

export type DBContent =
  | {
      type: 'collection';
      data: DataType<'collection'>;
    }
  | {
      type: 'item';
      data: DataType<'item'>;
    };

export type AttachmentsDBThumbnailType = 's128' | 's64';

export type AttachmentsDBContent = {
  file_name?: string;
  data: string;
  thumbnail_type?: AttachmentsDBThumbnailType;
  dimensions?: {
    width: number;
    height: number;
  };
  original_dimensions?: {
    width: number;
    height: number;
  };
  timestamp?: string;
};

export type DBSyncLog = {
  type: 'db_sync';
  timestamp: number;
  server: string;
} & (
  | { event: 'info'; raw: string }
  | { event: 'error_recovery'; raw: string }
  | { event: 'start'; raw: string }
  | { event: 'stop'; raw: string }
  | { event: 'login'; ok: boolean; raw: string }
  | ({
      event: 'complete';
      live: boolean;
      raw: string;
      ok: boolean;
      canceled: boolean;
    } & PouchDB.Replication.SyncResultComplete<{}>)
  | ({
      event: 'change';
      live: boolean;
      raw: string;
      ok: boolean;
    } & Omit<PouchDB.Replication.SyncResult<{}>, 'change'> & {
        change: Omit<PouchDB.Replication.SyncResult<{}>['change'], 'docs'>;
      })
  | {
      event: 'error';
      live: boolean;
      raw: string;
      ok: false;
    }
  | {
      event: 'paused';
      live: boolean;
      raw: string;
      ok: boolean;
    }
  | {
      event: 'active';
      live: boolean;
      // raw: string;
    }
  | {
      event: 'denied';
      live: boolean;
      raw: string;
    }
);

export type LogsDBContent = DBSyncLog;
