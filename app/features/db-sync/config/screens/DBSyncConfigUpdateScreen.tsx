import React, { useRef, useState, useCallback, useEffect } from 'react';
import { Alert, ScrollView } from 'react-native';

import { PouchDB } from '@app/db';

import type { StackScreenProps } from '@react-navigation/stack';
import type { RootStackParamList } from '@app/navigation';

import { useAppSelector, useAppDispatch } from '@app/redux';
import { selectActiveProfileConfig } from '@app/features/profiles';

import useScrollViewContentInsetFix from '@app/hooks/useScrollViewContentInsetFix';
import useScrollViewFirstInputAutoFocusFix from '@app/hooks/useScrollViewFirstInputAutoFocusFix';

import cs from '@app/utils/commonStyles';

import ModalContent from '@app/components/ModalContent';
import InsetGroup from '@app/components/InsetGroup';
import { selectConfig } from '../selectors';
import { createOrUpdateSync, removeSync } from '../slice';

function DBSyncConfigUpdateScreen({
  navigation,
  route,
}: StackScreenProps<RootStackParamList, 'DBSyncConfigUpdate'>) {
  const scrollViewRef = useRef<ScrollView>(null);
  useScrollViewContentInsetFix(scrollViewRef);
  useScrollViewFirstInputAutoFocusFix(scrollViewRef);

  const syncTargets = useAppSelector(selectConfig) || {};
  const oldConfig = syncTargets[route.params.name || ''] || {};

  const [name, setName] = useState(route.params.name || '');
  const nameErrorMessage = (() => {
    if (!name) {
      return 'Name is required';
    }

    if (name !== route.params.name && Object.keys(syncTargets).includes(name)) {
      return `"${name}" is already used`;
    }
  })();

  const [dbUri, setDbUri] = useState(oldConfig.db?.uri || '');
  const [dbUsername, setDbUsername] = useState(oldConfig.db?.username || '');
  const [dbPassword, setDbPassword] = useState(oldConfig.db?.password || '');
  const dbErrorMessage = (() => {
    if (!dbUri.match(/^https?:\/\//)) {
      return 'URI must start with "http://" or "https://"';
    }
  })();

  const [attachmentsDbUri, setAttachmentsDbUri] = useState(
    oldConfig.attachmentsDB?.uri || '',
  );
  const [attachmentsDbUsername, setAttachmentsDbUsername] = useState(
    oldConfig.attachmentsDB?.username || '',
  );
  const [attachmentsDbPassword, setAttachmentsDbPassword] = useState(
    oldConfig.attachmentsDB?.password || '',
  );
  const attachmentsDbErrorMessage = (() => {
    if (!attachmentsDbUri.match(/^https?:\/\//)) {
      return 'URI must start with "http://" or "https://"';
    }

    if (attachmentsDbUri === dbUri) {
      return 'Remote Attachments DB URI should not be the same as Remote DB URI';
    }
  })();

  const [testConnectionMessage, setTestConnectionMessage] = useState<
    string | undefined
  >(undefined);
  useEffect(() => {
    setTestConnectionMessage(undefined);
  }, [
    dbUri,
    dbUsername,
    dbPassword,
    attachmentsDbUri,
    attachmentsDbUsername,
    attachmentsDbPassword,
  ]);
  const handleTestConnection = useCallback(async () => {
    setTestConnectionMessage('TESTING');
    try {
      if (dbErrorMessage) throw new Error(dbErrorMessage);
      const remoteDB = new PouchDB(dbUri, { skip_setup: true });
      await remoteDB.logIn(dbUsername, dbPassword);
      await remoteDB.allDocs({ limit: 1, include_docs: false });
    } catch (e: any) {
      setTestConnectionMessage(
        `Remote DB connection failed: ${
          e.message || 'Unable to connect to server'
        }`,
      );
      return;
    }
    try {
      if (attachmentsDbErrorMessage) throw new Error(attachmentsDbErrorMessage);
      const remoteDB = new PouchDB(attachmentsDbUri, { skip_setup: true });
      await remoteDB.logIn(attachmentsDbUsername, attachmentsDbPassword);
      await remoteDB.allDocs({ limit: 1, include_docs: false });
    } catch (e: any) {
      setTestConnectionMessage(
        `Remote Attachments DB connection failed: ${
          e.message || 'Unable to connect to server'
        }`,
      );
      return;
    }

    setTestConnectionMessage('Connection success');
  }, [
    attachmentsDbErrorMessage,
    attachmentsDbPassword,
    attachmentsDbUri,
    attachmentsDbUsername,
    dbErrorMessage,
    dbPassword,
    dbUri,
    dbUsername,
  ]);

  const dispatch = useAppDispatch();
  const handleSave = useCallback(() => {
    if (nameErrorMessage) {
      Alert.alert('Notice', nameErrorMessage);
      return;
    }
    if (dbErrorMessage) {
      Alert.alert('Notice', dbErrorMessage);
      return;
    }
    if (attachmentsDbErrorMessage) {
      Alert.alert('Notice', attachmentsDbErrorMessage);
      return;
    }

    dispatch(
      createOrUpdateSync({
        name,
        syncConnectionConfig: {
          db: {
            uri: dbUri,
            username: dbUsername,
            password: dbPassword,
          },
          attachmentsDB: {
            uri: attachmentsDbUri,
            username: attachmentsDbUsername,
            password: attachmentsDbPassword,
          },
        },
      }),
    );

    navigation.goBack();
  }, [
    attachmentsDbErrorMessage,
    attachmentsDbPassword,
    attachmentsDbUri,
    attachmentsDbUsername,
    dbErrorMessage,
    dbPassword,
    dbUri,
    dbUsername,
    dispatch,
    name,
    nameErrorMessage,
    navigation,
  ]);

  const handleDelete = useCallback(() => {
    Alert.alert(
      'Confirm',
      `Are you sure you want to delete remote ${route.params.name}?`,
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            dispatch(removeSync({ name }));

            navigation.goBack();
          },
        },
      ],
    );
  }, [dispatch, name, navigation, route.params.name]);

  return (
    <ModalContent
      navigation={navigation}
      title={route.params.name ? `Edit ${route.params.name}` : 'New Remote'}
      action1Label="Save"
      action1MaterialIconName="check"
      action1Variant="strong"
      onAction1Press={handleSave}
    >
      <ScrollView
        ref={scrollViewRef}
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
      >
        {!route.params.name && (
          <InsetGroup
            labelContainerStyle={cs.mt16}
            label="Remote Name"
            footerLabel={nameErrorMessage}
          >
            <InsetGroup.Item>
              <InsetGroup.TextInput
                autoFocus
                placeholder="My Remote Server"
                autoCapitalize="words"
                value={name}
                onChangeText={setName}
              />
            </InsetGroup.Item>
          </InsetGroup>
        )}
        <InsetGroup
          labelContainerStyle={route.params.name ? cs.mt16 : undefined}
          label="Remote DB"
          footerLabel={dbErrorMessage}
        >
          <InsetGroup.Item
            vertical2
            label="URI"
            detail={
              <InsetGroup.TextInput
                placeholder="https://0.0.0.0:5984/database_name"
                autoCapitalize="none"
                keyboardType="url"
                value={dbUri}
                onChangeText={setDbUri}
              />
            }
          />
          <InsetGroup.ItemSeperator />
          <InsetGroup.Item
            vertical2
            label="Username"
            detail={
              <InsetGroup.TextInput
                placeholder="username"
                autoCapitalize="none"
                secureTextEntry={false}
                value={dbUsername}
                onChangeText={setDbUsername}
              />
            }
          />
          <InsetGroup.ItemSeperator />
          <InsetGroup.Item
            vertical2
            label="Password"
            detail={
              <InsetGroup.TextInput
                secureTextEntry
                placeholder="password"
                autoCapitalize="none"
                value={dbPassword}
                onChangeText={setDbPassword}
              />
            }
          />
        </InsetGroup>
        <InsetGroup
          label="Remote Attachments DB"
          footerLabel={attachmentsDbErrorMessage}
        >
          <InsetGroup.Item
            vertical2
            label="URI"
            detail={
              <InsetGroup.TextInput
                placeholder="https://0.0.0.0:5984/database_name"
                autoCapitalize="none"
                keyboardType="url"
                value={attachmentsDbUri}
                onChangeText={setAttachmentsDbUri}
              />
            }
          />
          <InsetGroup.ItemSeperator />
          <InsetGroup.Item
            vertical2
            label="Username"
            detail={
              <InsetGroup.TextInput
                placeholder="username"
                autoCapitalize="none"
                secureTextEntry={false}
                value={attachmentsDbUsername}
                onChangeText={setAttachmentsDbUsername}
              />
            }
          />
          <InsetGroup.ItemSeperator />
          <InsetGroup.Item
            vertical2
            label="Password"
            detail={
              <InsetGroup.TextInput
                secureTextEntry
                placeholder="password"
                autoCapitalize="none"
                value={attachmentsDbPassword}
                onChangeText={setAttachmentsDbPassword}
              />
            }
          />
        </InsetGroup>

        <InsetGroup
          footerLabel={
            testConnectionMessage === 'TESTING'
              ? undefined
              : testConnectionMessage
          }
        >
          <InsetGroup.Item
            button
            label="Test Connection"
            disabled={testConnectionMessage === 'TESTING'}
            onPress={handleTestConnection}
          />
        </InsetGroup>

        {!!route.params.name && (
          <InsetGroup>
            <InsetGroup.Item
              button
              destructive
              label="Delete"
              onPress={handleDelete}
            />
          </InsetGroup>
        )}
      </ScrollView>
    </ModalContent>
  );
}

export default DBSyncConfigUpdateScreen;