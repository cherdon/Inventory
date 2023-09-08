import { v4 as uuid } from 'uuid';

import { ConfigType } from '../../schema';

export const CONFIG: ConfigType = {
  uuid: uuid(),
  rfid_tag_company_prefix: '0000000',
  rfid_tag_individual_asset_reference_prefix: '100',
  rfid_tag_access_password: '12345678',
  default_use_mixed_rfid_tag_access_password: false,
  rfid_tag_access_password_encoding: '082a4c6e',
  collections_order: [],
};

export async function hasConfig({
  db,
}: {
  db: PouchDB.Database;
}): Promise<boolean> {
  return true;
}

export async function getConfig({
  db,
}: {
  db: PouchDB.Database;
}): Promise<ConfigType> {
  return CONFIG;
}

export async function updateConfig(
  config: Partial<ConfigType>,
  {
    db,
  }: {
    db: PouchDB.Database;
  },
): Promise<ConfigType> {
  return CONFIG;
}