import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Platform,
  RefreshControl,
  ScrollView,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { StackScreenProps } from '@react-navigation/stack';
import { ActivityIndicator, DataTable } from 'react-native-paper';

import commonStyles from '@app/utils/commonStyles';

import type { StackParamList } from '@app/navigation/MainStack';
import { useRootNavigation } from '@app/navigation/RootNavigationContext';

import useColors from '@app/hooks/useColors';
import useDB from '@app/hooks/useDB';

import ScreenContent from '@app/components/ScreenContent';
import ScreenContentScrollView from '@app/components/ScreenContentScrollView';
import UIGroup from '@app/components/UIGroup';

function PouchDBScreen({
  navigation,
}: StackScreenProps<StackParamList, 'PouchDB'>) {
  const { db } = useDB();
  const rootNavigation = useRootNavigation();

  const numberOfItemsPerPageList = [5, 10, 20, 50];
  const [perPage, setPerPage] = React.useState(numberOfItemsPerPageList[1]);
  const [page, setPage] = React.useState<number>(1);

  const [searchText, setSearchText] = useState('');

  const [data, setData] = useState<PouchDB.Core.AllDocsResponse<{}> | null>(
    null,
  );
  const totalRows = data ? data.total_rows : 0;
  const numberOfPages = Math.ceil(totalRows / perPage);

  const skip = perPage * (page - 1);
  const limit = perPage;
  const [loading, setLoading] = useState(true);

  const getData = useCallback(async () => {
    if (!db) return;

    setLoading(true);
    try {
      const results = await (searchText
        ? (db as any).search({
            query: searchText,
            fields: [],
            // TODO: support zh searching on Android
            // `language: ['zh', 'en']` will not work well
            // See: patches/pouchdb-quick-search+1.3.0.patch, uncomment `console.log('queryTerms', queryTerms)` and see the tokens got from string
            language: Platform.OS === 'ios' ? 'zh' : 'en',
            include_docs: true,
            skip,
            limit,
          })
        : db.allDocs({ include_docs: true, skip, limit }));
      setData(results);
    } catch (e: any) {
      Alert.alert(e?.message, JSON.stringify(e?.stack));
    } finally {
      setLoading(false);
    }
  }, [db, limit, searchText, skip]);
  useEffect(() => {
    getData();
  }, [getData]);
  useFocusEffect(
    useCallback(() => {
      getData();
    }, [getData]),
  );

  const [refreshing, setRefreshing] = useState(false);
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await getData();
    } catch (e: any) {
      Alert.alert('An Error Occurred', e.message);
    } finally {
      setRefreshing(false);
    }
  }, [getData]);

  return (
    <ScreenContent
      navigation={navigation}
      title="PouchDB"
      showSearch
      onSearchChangeText={setSearchText}
      action1Label="Put Data"
      action1SFSymbolName="plus.square.fill"
      action1MaterialIconName="square-edit-outline"
      onAction1Press={() => rootNavigation?.navigate('PouchDBPutDataModal', {})}
      action2Label="Settings"
      action2SFSymbolName="gearshape.fill"
      action2MaterialIconName="cog"
      onAction2Press={() => {}}
    >
      <ScreenContentScrollView
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
      >
        <UIGroup.FirstGroupSpacing iosLargeTitle />
        <UIGroup
          loading={loading}
          footer={
            totalRows
              ? `Showing ${skip + 1}-${Math.max(
                  Math.min(skip + perPage, totalRows),
                  skip + 1,
                )} of ${totalRows}.`
              : undefined
          }
          placeholder="No items to show."
        >
          {data &&
            data.rows.length > 0 &&
            UIGroup.ListItemSeparator.insertBetween(
              data.rows.map(d => (
                <UIGroup.ListItem
                  key={d.id}
                  label={d.id}
                  detail={JSON.stringify(d.doc)}
                  verticalArrangedIOS
                  navigable
                  onPress={() => navigation.push('PouchDBItem', { id: d.id })}
                />
              )),
            )}
        </UIGroup>

        <UIGroup footer={`Skip: ${skip}, limit: ${limit}.`}>
          <UIGroup.ListTextInputItem
            label="Page"
            horizontalLabel
            keyboardType="number-pad"
            returnKeyType="done"
            value={page.toString()}
            unit={`/ ${numberOfPages}`}
            onChangeText={t => {
              const n = parseInt(t, 10);
              if (isNaN(n)) return;
              if (n <= 0) return;

              setPage(n);
            }}
            selectTextOnFocus
            rightElement={
              <>
                <UIGroup.ListTextInputItem.Button
                  onPress={() =>
                    setPage(i => {
                      if (i <= 1) return i;
                      if (i > numberOfPages) return numberOfPages;
                      return i - 1;
                    })
                  }
                  disabled={page <= 1}
                >
                  ‹ Prev
                </UIGroup.ListTextInputItem.Button>
                <UIGroup.ListTextInputItem.Button
                  onPress={() => setPage(i => i + 1)}
                  disabled={page >= numberOfPages}
                >
                  Next ›
                </UIGroup.ListTextInputItem.Button>
              </>
            }
          />
          <UIGroup.ListItemSeparator />
          <UIGroup.ListTextInputItem
            label="Per Page"
            horizontalLabel
            keyboardType="number-pad"
            returnKeyType="done"
            value={perPage.toString()}
            onChangeText={t => {
              const n = parseInt(t, 10);
              if (isNaN(n)) return;
              if (n <= 0) return;

              setPerPage(n);
            }}
            selectTextOnFocus
            rightElement={
              <>
                {numberOfItemsPerPageList.map((n, i) => (
                  <UIGroup.ListTextInputItem.Button
                    key={i}
                    onPress={() => setPerPage(n)}
                  >
                    {n.toString()}
                  </UIGroup.ListTextInputItem.Button>
                ))}
              </>
            }
          />
        </UIGroup>

        {/*<DataTable>
          <DataTable.Header>
            <DataTable.Title>ID</DataTable.Title>
            <DataTable.Title>Value</DataTable.Title>
          </DataTable.Header>

          <View>
            {data &&
              data.rows.map(d => (
                <DataTable.Row
                  key={d.id}
                  onPress={() => navigation.push('PouchDBItem', { id: d.id })}
                >
                  <DataTable.Cell>{d.id}</DataTable.Cell>
                  <DataTable.Cell>{JSON.stringify(d.doc)}</DataTable.Cell>
                </DataTable.Row>
              ))}

            <TableLoadingOverlay show={loading} />
          </View>

          <DataTable.Pagination
            page={page}
            numberOfPages={numberOfPages}
            onPageChange={p => setPage(p)}
            label={`${skip + 1}-${Math.min(
              skip + perPage,
              totalRows,
            )} of ${totalRows}`}
            selectPageDropdownLabel="Per page:"
            showFastPaginationControls
            numberOfItemsPerPageList={numberOfItemsPerPageList}
            numberOfItemsPerPage={perPage}
            onItemsPerPageChange={setPerPage}
          />
        </DataTable>*/}
      </ScreenContentScrollView>
    </ScreenContent>
  );
}

function TableLoadingOverlay({ show }: { show: boolean }) {
  const { backgroundColor } = useColors();

  return (
    <View
      style={[commonStyles.overlay, commonStyles.centerChildren]}
      pointerEvents={show ? 'auto' : 'none'}
    >
      <View
        style={[
          commonStyles.overlay,
          commonStyles.opacity05,
          show && { backgroundColor },
        ]}
        pointerEvents={show ? 'auto' : 'none'}
      />
      <ActivityIndicator animating={show} hidesWhenStopped size="large" />
    </View>
  );
}

export default PouchDBScreen;
