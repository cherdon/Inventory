import { v4 as uuid } from 'uuid';

import getCallbacks from '../callbacks';
import schema, { DataTypeName } from '../schema';
import {
  DataMeta,
  GetConfig,
  GetData,
  GetDatum,
  GetRelated,
  SaveDatum,
} from '../types';
import { hasChanges } from '../utils';
import { getValidationErrorFromZodSafeParseReturnValue } from '../utils/validation-utils';
import getValidation, { getErrorFromValidationResults } from '../validation';

export default function getSaveDatum({
  getConfig,
  getDatum,
  getData,
  getRelated,
  writeDatum,
  deleteDatum,
  skipSaveCallback,
}: {
  getConfig: GetConfig;
  getDatum: GetDatum;
  getData: GetData;
  getRelated: GetRelated;
  writeDatum: (
    d: DataMeta<DataTypeName> & { [key: string]: unknown },
  ) => Promise<void>;
  deleteDatum: (
    d: DataMeta<DataTypeName> & { [key: string]: unknown },
  ) => Promise<void>;
  skipSaveCallback?: (existingData: unknown, dataToSave: unknown) => void;
}): SaveDatum {
  const { beforeSave } = getCallbacks({
    getConfig,
    getDatum,
    getData,
    getRelated,
  });

  const { validate, validateDelete } = getValidation({
    getConfig,
    getDatum,
    getData,
    getRelated,
  });

  const saveDatum: SaveDatum = async <T extends DataTypeName>(
    d: DataMeta<T> & { [key: string]: unknown },
    options: {
      noTouch?: boolean;
      forceTouch?: boolean;
      ignoreConflict?: boolean;
      skipValidation?: boolean;
      skipCallbacks?: boolean;
    } = {},
  ) => {
    const existingData = await (async () => {
      if (typeof d.__id !== 'string') return null;

      return await getDatum(d.__type, d.__id);
    })();

    const dataToSave: DataMeta<T> & { [key: string]: unknown } = {
      ...(existingData
        ? (Object.fromEntries(
            Object.entries(existingData).filter(
              ([k]) => k !== '__rev' && k !== '__type',
            ),
          ) as any)
        : {}),
      ...d,
      ...(options.ignoreConflict && existingData?.__rev
        ? { __rev: existingData.__rev }
        : {}),
    };

    if (typeof dataToSave.__created_at !== 'number') {
      dataToSave.__created_at = new Date().getTime();
    }

    if (typeof dataToSave.__updated_at !== 'number') {
      dataToSave.__updated_at = new Date().getTime();
    }

    const s = schema[d.__type];

    if (!options.skipCallbacks) {
      await beforeSave(dataToSave);
    }

    if (!dataToSave.__deleted) {
      // Save
      if (typeof dataToSave.__id !== 'string') {
        dataToSave.__id = uuid();
      }

      if (!options.skipValidation) {
        const safeParseResults = s.safeParse(dataToSave);
        const safeParseError =
          getValidationErrorFromZodSafeParseReturnValue(safeParseResults);
        if (safeParseError) throw safeParseError;

        const validationResults = await validate(dataToSave);
        const validationError =
          getErrorFromValidationResults(validationResults);
        if (validationError) throw validationError;
      }

      if (
        existingData &&
        !hasChanges(existingData, dataToSave) &&
        !options.forceTouch
      ) {
        // Data has not been changed, skip saving
        if (skipSaveCallback) skipSaveCallback(existingData, dataToSave);
        return dataToSave;
      }

      if (!options.noTouch) {
        dataToSave.__updated_at = new Date().getTime();
      }

      await writeDatum(dataToSave);
    } else {
      // Delete
      if (typeof dataToSave.__id !== 'string') {
        throw new Error('__id must be specified while setting __deleted: true');
      }

      if (!options.skipValidation) {
        const validationResults = await validateDelete({
          ...dataToSave,
          __id: dataToSave.__id,
          __deleted: true,
        });
        const validationError =
          getErrorFromValidationResults(validationResults);
        if (validationError) throw validationError;
      }

      await deleteDatum(dataToSave);
    }

    return dataToSave;
  };

  return saveDatum;
}
