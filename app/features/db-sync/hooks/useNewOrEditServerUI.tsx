import React, {
  RefObject,
  useCallback,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Alert, TextInput } from 'react-native';

import { diff } from 'deep-object-diff';

import appLogger from '@app/logger';

import { actions, selectors, useAppDispatch, useAppSelector } from '@app/redux';

import filterObjectKeys from '@app/utils/filterObjectKeys';

import UIGroup from '@app/components/UIGroup';

import { initialServerState } from '../slice';
const logger = appLogger.for({ module: 'DBSync UI' });

type Props = {
  id?: string;
  afterSave?: () => void;
  onNameInputFocus?: () => void;
};

type Return = {
  newOrEditServerUIElement: JSX.Element;
  hasUnsavedChanges: boolean;
  handleSave: () => void;
  handleLeave: (confirm: () => void) => void;
  nameInputRef: RefObject<TextInput>;
  dbUriInputRef: RefObject<TextInput>;
  dbUsernameInputRef: RefObject<TextInput>;
  dbPasswordInputRef: RefObject<TextInput>;
};

export default function useNewOrEditServerUI({
  id,
  afterSave,
  onNameInputFocus,
}: Props): Return {
  const dispatch = useAppDispatch();
  const servers = useAppSelector(selectors.dbSync.servers);
  const editingServer = servers[id || ''];
  const initialState = useMemo(
    () =>
      filterObjectKeys(editingServer || initialServerState, [
        'enabled',
        'name',
        'uri',
        'username',
        'password',
      ]),
    [editingServer],
  );
  const [state, setState] = useState(initialState);
  const hasUnsavedChanges = useMemo(
    () => Object.keys(diff(state, initialState)).length > 0,
    [initialState, state],
  );

  const nameErrorMessage = useMemo(() => {
    if (!state.name) {
      return 'Name is required.';
    }
    return null;
  }, [state.name]);

  const uriErrorMessage = useMemo(() => {
    if (!state.uri.match(/^https?:\/\//)) {
      return 'URI must start with "http://" or "https://".';
    }
    return null;
  }, [state.uri]);

  const usernameErrorMessage = useMemo(() => {
    if (!state.username) {
      return 'Username is required.';
    }
    return null;
  }, [state.username]);

  const passwordErrorMessage = useMemo(() => {
    if (!state.password) {
      return 'Password is required.';
    }
    return null;
  }, [state.password]);

  const isSaved = useRef(false);
  const handleSave = useCallback(() => {
    const errorMessages = [
      nameErrorMessage,
      uriErrorMessage,
      usernameErrorMessage,
      passwordErrorMessage,
    ].filter(m => m);

    if (errorMessages.length > 0) {
      Alert.alert(
        'Please fix the following errors',
        errorMessages.map(m => `• ${m}`).join('\n'),
      );
      return;
    }

    try {
      if (!id) {
        dispatch(actions.dbSync.createServer(state));
      } else {
        dispatch(actions.dbSync.updateServer([id, state]));
      }
      isSaved.current = true;
      afterSave && afterSave();
    } catch (e) {
      logger.error(e, { showAlert: true });
    }
  }, [
    nameErrorMessage,
    uriErrorMessage,
    usernameErrorMessage,
    passwordErrorMessage,
    id,
    afterSave,
    dispatch,
    state,
  ]);

  const handleLeave = useCallback(
    (confirm: () => void) => {
      if (isSaved.current) {
        confirm();
        return;
      }

      if (!hasUnsavedChanges) {
        confirm();
        return;
      }

      Alert.alert(
        'Discard Changes?',
        'You have unsaved changes. Are you sure you want to discard them and leave?',
        [
          { text: "Don't leave", style: 'cancel', onPress: () => {} },
          {
            text: 'Discard',
            style: 'destructive',
            onPress: confirm,
          },
        ],
      );
    },
    [hasUnsavedChanges],
  );

  const nameInputRef = useRef<TextInput>(null);
  const dbUriInputRef = useRef<TextInput>(null);
  const dbUsernameInputRef = useRef<TextInput>(null);
  const dbPasswordInputRef = useRef<TextInput>(null);

  const newOrEditServerUIElement = (
    <>
      <UIGroup header="Server Name" footer={nameErrorMessage || undefined}>
        <UIGroup.ListTextInputItem
          ref={nameInputRef}
          placeholder="My Remote Server"
          value={state.name}
          onChangeText={text => setState({ ...state, name: text })}
          returnKeyType="done"
          onFocus={onNameInputFocus}
        />
      </UIGroup>
      <UIGroup
        header="Connection"
        footer={
          uriErrorMessage ||
          usernameErrorMessage ||
          passwordErrorMessage ||
          undefined
        }
      >
        <UIGroup.ListTextInputItem
          ref={dbUriInputRef}
          label="URI"
          placeholder="https://0.0.0.0:5984/database_name"
          autoCapitalize="none"
          keyboardType="url"
          value={state.uri}
          onChangeText={text => setState({ ...state, uri: text })}
          returnKeyType="next"
          onSubmitEditing={() => dbUsernameInputRef.current?.focus()}
        />
        <UIGroup.ListItemSeparator />
        <UIGroup.ListTextInputItem
          ref={dbUsernameInputRef}
          label="Username"
          placeholder="username"
          autoCapitalize="none"
          value={state.username}
          onChangeText={text => setState({ ...state, username: text })}
          returnKeyType="next"
          onSubmitEditing={() => dbPasswordInputRef.current?.focus()}
        />
        <UIGroup.ListItemSeparator />
        <UIGroup.ListTextInputItem
          ref={dbPasswordInputRef}
          label="Password"
          placeholder="********"
          secureTextEntry
          value={state.password}
          onChangeText={text => setState({ ...state, password: text })}
          returnKeyType="done"
        />
      </UIGroup>
      <UIGroup>
        <UIGroup.ListItem button onPress={() => {}} label="Test Connection" />
      </UIGroup>
    </>
  );

  return {
    newOrEditServerUIElement,
    hasUnsavedChanges,
    handleSave,
    handleLeave,
    nameInputRef,
    dbUriInputRef,
    dbUsernameInputRef,
    dbPasswordInputRef,
  };
}