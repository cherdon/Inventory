import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  LayoutAnimation,
  Platform,
  RefreshControl,
  StyleSheet,
  Text as RNText,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { StackScreenProps } from '@react-navigation/stack';
import Svg, { Path, Rect } from 'react-native-svg';

import { DEFAULT_LAYOUT_ANIMATION_CONFIG } from '@app/consts/animations';

import { actions, selectors, useAppDispatch } from '@app/redux';

import {
  DataTypeWithAdditionalInfo,
  onlyValid,
  useConfig,
  useData,
  useRelated,
  useSave,
} from '@app/data';

import commonStyles from '@app/utils/commonStyles';

import type { StackParamList } from '@app/navigation/MainStack';
import { useRootBottomSheets } from '@app/navigation/RootBottomSheetsContext';
import { useRootNavigation } from '@app/navigation/RootNavigationContext';

import useActionSheet from '@app/hooks/useActionSheet';
import useColors from '@app/hooks/useColors';
import useOrdered from '@app/hooks/useOrdered';

import Button from '@app/components/Button';
import Icon, { verifyIconNameWithDefault } from '@app/components/Icon';
import ScreenContent from '@app/components/ScreenContent';
import Text from '@app/components/Text';
import UIGroup from '@app/components/UIGroup';

import ItemListItem from '../components/ItemListItem';
import useCheckItems from '../hooks/useCheckItems';

function ItemScreen({
  navigation,
  route,
}: StackScreenProps<StackParamList, 'Item'>) {
  const { id, preloadedTitle } = route.params;

  const rootNavigation = useRootNavigation();
  const { openRfidSheet } = useRootBottomSheets();
  const { showActionSheet } = useActionSheet();

  const { config, loading: configLoading } = useConfig();
  const { save } = useSave();

  const [reloadCounter, setReloadCounter] = useState(0);
  const {
    data,
    loading: dataLoading,
    reload: reloadData,
    refresh: refreshData,
    refreshing: dataRefreshing,
  } = useData('item', id);
  const {
    data: collection,
    loading: collectionLoading,
    refresh: refreshCollection,
    refreshing: collectionRefreshing,
  } = useRelated(data, 'collection');
  const {
    data: container,
    loading: containerLoading,
    refresh: refreshContainer,
    refreshing: containerRefreshing,
  } = useRelated(data, 'container');
  const [dContentsLoading, setDContentsLoading] = useState(true);
  useEffect(() => {
    const timer = setTimeout(() => {
      setDContentsLoading(false);
    }, 2);

    return () => {
      clearTimeout(timer);
    };
  }, []);
  const {
    data: contents,
    loading: contentsLoading,
    refresh: refreshContents,
    refreshing: contentsRefreshing,
  } = useRelated(data, 'contents', {
    sort: [{ __created_at: 'asc' }],
    disable: dContentsLoading,
    onInitialLoad: useCallback(() => {
      LayoutAnimation.configureNext(DEFAULT_LAYOUT_ANIMATION_CONFIG);
    }, []),
  });
  const refresh = useCallback(() => {
    refreshData();
    refreshCollection();
    refreshContainer();
    refreshContents();
    setReloadCounter(v => v + 1);
  }, [refreshCollection, refreshData, refreshContainer, refreshContents]);
  const refreshing =
    dataRefreshing ||
    collectionRefreshing ||
    containerRefreshing ||
    contentsRefreshing;

  useFocusEffect(
    useCallback(() => {
      setReloadCounter(v => v + 1);
    }, []),
  );

  const [orderedContents] = useOrdered(
    contents && onlyValid(contents),
    data?.__valid ? data.contents_order || [] : [],
  );

  const handleUpdateContentsOrder = useCallback<
    (
      items: ReadonlyArray<DataTypeWithAdditionalInfo<'item'>>,
    ) => Promise<boolean>
  >(
    async its => {
      if (!data || !data.__valid) return false;

      try {
        await save({
          ...data,
          contents_order: its
            .map(it => it.__id)
            .filter((s): s is string => !!s),
        });
        reloadData();
        return true;
      } catch (e) {
        return false;
      }
    },
    [data, reloadData, save],
  );
  const handleUpdateContentsOrderFnRef = useRef(handleUpdateContentsOrder);
  handleUpdateContentsOrderFnRef.current = handleUpdateContentsOrder;

  const writeActualEpcContent = useCallback(async () => {
    if (!data || !data.__valid) return;
    if (!data.rfid_tag_epc_memory_bank_contents) return;

    data.actual_rfid_tag_epc_memory_bank_contents =
      data.rfid_tag_epc_memory_bank_contents;
    try {
      await save(data);
      refreshData();
    } catch (e) {}
  }, [data, refreshData, save]);

  const [displayEpc, setDisplayEpc] = useState<null | 'epc' | 'hex'>(null);
  const switchDisplayEpc = useCallback(() => {
    setDisplayEpc(oldValue => {
      switch (oldValue) {
        case null:
          return 'epc';
        case 'epc':
          return 'hex';
        case 'hex':
          return null;
      }
    });
  }, []);

  const handleNewContent = useCallback(
    () =>
      rootNavigation?.push('SaveItem', {
        initialData: {
          container_id: data?.__id,
          collection_id:
            typeof data?.collection_id === 'string'
              ? data?.collection_id
              : undefined,
          icon_name:
            typeof collection?.item_default_icon_name === 'string'
              ? collection?.item_default_icon_name
              : undefined,
        },
        afterSave: it => {
          it.__id &&
            (it.rfid_tag_epc_memory_bank_contents ||
              it.container_id !== data?.__id) &&
            navigation.push('Item', { id: it.__id });
        },
        afterDelete: () => {
          navigation.goBack();
        },
      }),
    [
      collection?.item_default_icon_name,
      data?.__id,
      data?.collection_id,
      navigation,
      rootNavigation,
    ],
  );

  const [devModeCounter, setDevModeCounter] = useState(0);

  const { iosTintColor, groupTitleColor } = useColors();

  const afterRFIDTagWriteSuccessRef = useRef<(() => void) | null>(null);
  afterRFIDTagWriteSuccessRef.current = () => {
    if (data && !data.actual_rfid_tag_epc_memory_bank_contents)
      writeActualEpcContent();
  };

  const [handleCheckContents] = useCheckItems({
    scanName: `container-${id}-scan`,
    items: [],
    navigation,
  });

  const handleMoreActionsPress = useCallback(() => {
    // const options = [
    //   item?.isContainer && 'new-dedicated-item',
    //   item && 'duplicate',
    // ].filter((s): s is string => !!s);
    // const optionNames: Record<string, string> = {
    //   'new-dedicated-item': `New ${(() => {
    //     switch (item?.isContainerType) {
    //       case 'generic-container':
    //       case 'item-with-parts':
    //         return 'Part';
    //       default:
    //         return 'Dedicated Item';
    //     }
    //   })()}...`,
    //   duplicate: 'Duplicate',
    // };
    // const shownOptions = options.map(v => optionNames[v]);
    // showActionSheetWithOptions(
    //   {
    //     options: [...shownOptions, 'Cancel'],
    //     cancelButtonIndex: shownOptions.length,
    //   },
    //   buttonIndex => {
    //     if (buttonIndex === shownOptions.length) {
    //       // cancel action
    //       return;
    //     }
    //     const selectedOption =
    //       typeof buttonIndex === 'number' ? options[buttonIndex] : null;
    //     switch (selectedOption) {
    //       case 'new-dedicated-item':
    //         return handleNewContent();
    //       case 'duplicate':
    //         if (!item) return;
    //         rootNavigation?.navigate('SaveItem', {
    //           initialData: {
    //             ...Object.fromEntries(
    //               Object.entries(item).filter(
    //                 ([k]) =>
    //                   !k.startsWith('computed') &&
    //                   k !== 'actualRfidTagEpcMemoryBankContents' &&
    //                   k !== 'rfidTagAccessPassword' &&
    //                   k !== 'createdAt' &&
    //                   k !== 'updatedAt',
    //               ),
    //             ),
    //             id: undefined,
    //             rev: undefined,
    //           },
    //           afterSave: it => {
    //             it.id && navigation.push('Item', { id: it.id });
    //           },
    //         });
    //         return;
    //       default:
    //         Alert.alert('TODO', `${selectedOption} is not implemented yet.`);
    //         return;
    //     }
    //   },
    // );
  }, []);

  const dispatch = useAppDispatch();
  useEffect(() => {
    dispatch(actions.inventory.addRecentViewedItemId({ id }));
  }, [dispatch, id]);

  const dedicatedItemsName = (() => {
    switch (data?.item_type) {
      case 'item_with_parts':
        return 'Parts';
      default:
        return 'Contents';
    }
  })();

  return (
    <ScreenContent
      navigation={navigation}
      route={route}
      title={
        (typeof data?.name === 'string' ? data.name : preloadedTitle) || 'Item'
      }
      action1Label="Edit"
      action1SFSymbolName={(data && 'square.and.pencil') || undefined}
      action1MaterialIconName={(data && 'pencil') || undefined}
      onAction1Press={
        data?.__valid
          ? () =>
              rootNavigation?.navigate('SaveItem', {
                initialData: data,
                afterDelete: () => navigation.goBack(),
              })
          : undefined
      }
      action2Label={(data && 'Actions') || undefined}
      action2SFSymbolName={(data && 'ellipsis.circle') || undefined}
      action2MaterialIconName={(data && 'dots-horizontal') || undefined}
      onAction2Press={handleMoreActionsPress}
    >
      <ScreenContent.ScrollView
        refreshControl={
          <RefreshControl onRefresh={refresh} refreshing={refreshing} />
        }
      >
        <UIGroup.FirstGroupSpacing iosLargeTitle />
        <UIGroup
          loading={dataLoading}
          // eslint-disable-next-line react/no-unstable-nested-components
          footer={(() => {
            if (!data?.__valid) return undefined;

            if (data?.rfid_tag_epc_memory_bank_contents) {
              if (!data?.actual_rfid_tag_epc_memory_bank_contents) {
                return (
                  <>
                    <Icon
                      name="app-exclamation"
                      color="yellow"
                      size={16}
                      style={commonStyles.mbm2}
                    />
                    <RNText> </RNText>
                    <RNText>
                      This item has an EPC number but it's not written on any
                      RFID tag. Press the "Write Tag" button to write the EPC
                      number onto a tag that is attached to the item.
                    </RNText>
                    <RNText> </RNText>
                    <RNText>You can also</RNText>
                    <RNText> </RNText>
                    <RNText
                      onPress={() =>
                        Alert.alert(
                          'Confirm',
                          "Do you want to treat this item as it's EPC has been written to the RFID tag?",
                          [
                            {
                              text: 'No',
                              style: 'cancel',
                              onPress: () => {},
                            },
                            {
                              text: 'Yes',
                              // style: 'destructive',
                              onPress: writeActualEpcContent,
                            },
                          ],
                        )
                      }
                      style={{ color: iosTintColor }}
                    >
                      manually set this as done
                    </RNText>
                    <RNText>.</RNText>
                  </>
                );
              }

              if (
                data?.actual_rfid_tag_epc_memory_bank_contents !==
                data?.rfid_tag_epc_memory_bank_contents
              ) {
                return (
                  <>
                    <Icon
                      name="app-info"
                      color={groupTitleColor}
                      size={16}
                      style={commonStyles.mbm2}
                    />
                    <RNText> </RNText>
                    <RNText>
                      The actual EPC number written to the RFID tag of this item
                      is outdated. Press the "Write Tag" button to open the
                      Write Tag panel, use "Wipe" to reset a RFID tag and then
                      press "Write" to write the updated EPC content. If you're
                      done with the update, you can
                    </RNText>
                    <RNText> </RNText>
                    <RNText
                      onPress={() =>
                        Alert.alert(
                          'Confirm',
                          'Are you sure you\'ve done with the RFID tag update? After pressing "Yes", you will not be able to locate or scan this item with the old and outdated EPC number.',
                          [
                            {
                              text: 'No',
                              style: 'cancel',
                              onPress: () => {},
                            },
                            {
                              text: 'Yes',
                              style: 'destructive',
                              onPress: writeActualEpcContent,
                            },
                          ],
                        )
                      }
                      style={{ color: iosTintColor }}
                    >
                      manually set this as done
                    </RNText>
                    <RNText>.</RNText>
                  </>
                );
              }
            }
          })()}
        >
          {(() => {
            const item = data && onlyValid(data);
            if (!item) return null;

            const validContainer = container && onlyValid(container);
            const validCollection = collection && onlyValid(collection);

            const handleContainerPress = () =>
              item.container_id &&
              navigation.push('Item', {
                id: item.container_id,
                preloadedTitle: validContainer?.name,
              });

            const handleCollectionPress = () =>
              item.collection_id &&
              navigation.push('Collection', {
                id: item.collection_id,
                preloadedTitle: validCollection?.name,
              });

            return (
              <>
                <TouchableWithoutFeedback
                  onPress={() => {
                    setDevModeCounter(v => v + 1);
                  }}
                >
                  <UIGroup.ListItem
                    verticalArrangedLargeTextIOS
                    label="Item Name"
                    detail={item.name}
                    // eslint-disable-next-line react/no-unstable-nested-components
                    rightElement={({ iconProps }) => (
                      <Icon
                        name={verifyIconNameWithDefault(item.icon_name)}
                        color={item.icon_color}
                        {...iconProps}
                      />
                    )}
                  />
                </TouchableWithoutFeedback>
                {devModeCounter > 10 && (
                  <>
                    <UIGroup.ListItemSeparator />
                    <UIGroup.ListItem
                      verticalArrangedLargeTextIOS
                      label="ID"
                      monospaceDetail
                      adjustsDetailFontSizeToFit
                      detail={item.__id}
                    />
                    <UIGroup.ListItemSeparator />
                    <UIGroup.ListItem
                      verticalArrangedLargeTextIOS
                      label="Created At"
                      monospaceDetail
                      detail={
                        item.__created_at
                          ? new Date(item.__created_at).toISOString()
                          : '(null)'
                      }
                    />
                    <UIGroup.ListItemSeparator />
                    <UIGroup.ListItem
                      verticalArrangedLargeTextIOS
                      label="Updated At"
                      monospaceDetail
                      detail={
                        item.__updated_at
                          ? new Date(item.__updated_at).toISOString()
                          : '(null)'
                      }
                    />
                  </>
                )}
                {!!item.container_id && (
                  <>
                    <UIGroup.ListItemSeparator />
                    {validContainer ? (
                      <UIGroup.ListItem
                        verticalArrangedLargeTextIOS
                        label={(() => {
                          switch (validContainer.item_type) {
                            case 'item_with_parts':
                              return 'Part of';
                            default:
                              return 'Container';
                          }
                        })()}
                        detail={validContainer.name}
                        // eslint-disable-next-line react/no-unstable-nested-components
                        rightElement={({ iconProps }) => (
                          <Icon
                            name={verifyIconNameWithDefault(
                              validContainer.icon_name,
                            )}
                            color={validContainer.icon_color}
                            {...iconProps}
                          />
                        )}
                        onPress={handleContainerPress}
                      />
                    ) : (
                      <UIGroup.ListItem
                        verticalArrangedLargeTextIOS
                        label="Container"
                        detail="Loading..."
                        onPress={handleContainerPress}
                      />
                    )}
                  </>
                )}
                <UIGroup.ListItemSeparator />
                {validCollection ? (
                  <UIGroup.ListItem
                    verticalArrangedLargeTextIOS
                    label="In Collection"
                    detail={validCollection.name}
                    // eslint-disable-next-line react/no-unstable-nested-components
                    rightElement={({ iconProps }) => (
                      <Icon
                        name={verifyIconNameWithDefault(
                          validCollection.icon_name,
                        )}
                        color={validCollection.icon_color}
                        {...iconProps}
                      />
                    )}
                    onPress={handleCollectionPress}
                  />
                ) : (
                  <UIGroup.ListItem
                    verticalArrangedLargeTextIOS
                    label="In Collection"
                    detail="Loading..."
                    onPress={handleCollectionPress}
                  />
                )}
                {item._individual_asset_reference && (
                  <>
                    <UIGroup.ListItemSeparator />
                    <TouchableWithoutFeedback
                      style={commonStyles.flex1}
                      onPress={switchDisplayEpc}
                    >
                      {(() => {
                        const rightElement = (
                          <>
                            <TouchableOpacity
                              style={[
                                styles.buttonWithAnnotationText,
                                commonStyles.mr12,
                              ]}
                              onPress={() =>
                                openRfidSheet({
                                  functionality: 'write',
                                  epc: item.rfid_tag_epc_memory_bank_contents,
                                  tagAccessPassword:
                                    item.rfid_tag_access_password,
                                  afterWriteSuccessRef:
                                    afterRFIDTagWriteSuccessRef,
                                })
                              }
                            >
                              <RFIDWriteIcon />
                              <Text
                                style={[
                                  styles.buttonAnnotationText,
                                  { color: iosTintColor },
                                ]}
                              >
                                Write Tag
                              </Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={[
                                styles.buttonWithAnnotationText,
                                !item.actual_rfid_tag_epc_memory_bank_contents &&
                                  commonStyles.opacity04,
                              ]}
                              onPress={() =>
                                openRfidSheet({
                                  functionality: 'locate',
                                  epc: item.actual_rfid_tag_epc_memory_bank_contents,
                                })
                              }
                              disabled={
                                !item.actual_rfid_tag_epc_memory_bank_contents
                              }
                            >
                              {/*
                              <Icon
                                name="rfid-locate"
                                size={44}
                                sfSymbolWeight="medium"
                                showBackground
                                backgroundColor="transparent"
                                color={iosTintColor}
                              />
                              */}
                              <RFIDLocateIcon />
                              <Text
                                style={[
                                  styles.buttonAnnotationText,
                                  { color: iosTintColor },
                                ]}
                              >
                                Locate
                              </Text>
                            </TouchableOpacity>
                          </>
                        );

                        switch (displayEpc) {
                          case 'epc': {
                            return (
                              <UIGroup.ListItem
                                verticalArrangedLargeTextIOS
                                label="EPC Tag URI"
                                detail={item.epc_tag_uri}
                                monospaceDetail
                                rightElement={rightElement}
                              />
                            );
                          }
                          case 'hex': {
                            return (
                              <UIGroup.ListItem
                                verticalArrangedLargeTextIOS
                                label="RFID Tag EPC (Hex)"
                                detail={item.rfid_tag_epc_memory_bank_contents}
                                monospaceDetail
                                rightElement={rightElement}
                              />
                            );
                          }
                          default:
                            let iar = item._individual_asset_reference;
                            if (config?.rfid_tag_prefix) {
                              const prefixPart = `${config?.rfid_tag_prefix}.`;
                              if (iar.startsWith(prefixPart)) {
                                iar = iar.slice(prefixPart.length);
                              }
                            }
                            return (
                              <UIGroup.ListItem
                                verticalArrangedLargeTextIOS
                                label="Individual Asset Reference"
                                detail={iar}
                                monospaceDetail
                                rightElement={rightElement}
                              />
                            );
                        }
                      })()}
                    </TouchableWithoutFeedback>
                  </>
                )}
                {devModeCounter > 10 && (
                  <>
                    <UIGroup.ListItemSeparator />
                    <UIGroup.ListItem
                      verticalArrangedLargeTextIOS
                      label="Actual RFID Tag EPC Memory Bank Contents"
                      monospaceDetail
                      detail={
                        item.actual_rfid_tag_epc_memory_bank_contents ||
                        '(null)'
                      }
                    />
                  </>
                )}
              </>
            );
          })()}
        </UIGroup>

        {typeof data?.item_type === 'string' &&
          ['container', 'generic_container', 'item_with_parts'].includes(
            data.item_type,
          ) && (
            <>
              {(orderedContents || []).length > 0 && (
                <UIGroup transparentBackground>
                  <Button
                    mode={Platform.OS === 'ios' ? 'text' : 'contained-tonal'}
                    onPress={handleCheckContents}
                  >
                    {({ textProps, iconProps }) => (
                      <>
                        <Icon {...iconProps} name="checklist" />
                        <Text {...textProps}>Check {dedicatedItemsName}</Text>
                      </>
                    )}
                  </Button>
                </UIGroup>
              )}
              <UIGroup
                largeTitle
                header={dedicatedItemsName}
                loading={contentsLoading}
                placeholder={contentsLoading ? undefined : 'No items'}
                headerRight={
                  <>
                    {!!orderedContents && (
                      <UIGroup.TitleButton
                        onPress={() =>
                          rootNavigation?.push('OrderItems', {
                            orderedItems: orderedContents,
                            onSaveFunctionRef: handleUpdateContentsOrderFnRef,
                          })
                        }
                      >
                        {({ iconProps }) => (
                          <Icon {...iconProps} name="app-reorder" />
                        )}
                      </UIGroup.TitleButton>
                    )}
                    <UIGroup.TitleButton primary onPress={handleNewContent}>
                      {({ iconProps, textProps }) => (
                        <>
                          <Icon {...iconProps} name="add" />
                          <Text {...textProps}>New</Text>
                        </>
                      )}
                    </UIGroup.TitleButton>
                  </>
                }
              >
                {!!orderedContents &&
                  orderedContents.length > 0 &&
                  UIGroup.ListItemSeparator.insertBetween(
                    orderedContents.map(i => (
                      <ItemListItem
                        key={i.__id}
                        item={i}
                        onPress={() =>
                          navigation.push('Item', {
                            id: i.__id || '',
                            preloadedTitle: i.name,
                          })
                        }
                        hideContainerDetails
                        hideCollectionDetails={
                          i.collection_id === data.collection_id
                        }
                      />
                    )),
                  )}
              </UIGroup>
            </>
          )}

        {typeof data?.notes === 'string' && (
          <UIGroup header="Notes" largeTitle>
            <UIGroup.ListItem>
              <Text>{data.notes}</Text>
            </UIGroup.ListItem>
          </UIGroup>
        )}

        {(() => {
          const detailElements = [];

          if (typeof data?.model_name === 'string') {
            detailElements.push(
              <UIGroup.ListItem
                key="modelName"
                verticalArrangedLargeTextIOS
                label="Model Name"
                detail={data.model_name}
              />,
            );
          }

          if (typeof data?.purchase_price_x1000 === 'number') {
            // const strValue = (() => {
            //   const str = item.purchase_price_x1000.toString();
            //   const a = str.slice(0, -3) || '0';
            //   const b = str.slice(-3).padStart(3, '0').replace(/0+$/, '');
            //   if (!b) {
            //     return a;
            //   }
            //   return a + '.' + b;
            // })();
            const strValue = new Intl.NumberFormat('en-US').format(
              data.purchase_price_x1000 / 1000.0,
            );
            detailElements.push(
              <UIGroup.ListItem
                key="purchasePrice"
                verticalArrangedLargeTextIOS
                label="Purchase Price"
                // eslint-disable-next-line react/no-unstable-nested-components
                detail={({ textProps }) => (
                  <Text {...textProps}>
                    {strValue}
                    {typeof data?.purchase_price_currency === 'string' && (
                      <Text
                        {...textProps}
                        style={[textProps.style, styles.unitText]}
                      >
                        {' ' + data.purchase_price_currency}
                      </Text>
                    )}
                  </Text>
                )}
              />,
            );
          }

          if (typeof data?.purchased_from === 'string') {
            detailElements.push(
              <UIGroup.ListItem
                key="purchasedFrom"
                verticalArrangedLargeTextIOS
                label="Purchased From"
                detail={data.purchased_from}
              />,
            );
          }

          if (data?.__valid && data?.purchase_date) {
            detailElements.push(
              <UIGroup.ListItem
                key="purchaseDate"
                verticalArrangedLargeTextIOS
                label="Purchase Date"
                // eslint-disable-next-line react/no-unstable-nested-components
                detail={({ textProps }) => (
                  <DateDisplay
                    textProps={textProps}
                    date={new Date(data.purchase_date || 0)}
                  />
                )}
              />,
            );
          }

          if (data?.__valid && data?.expiry_date) {
            detailElements.push(
              <UIGroup.ListItem
                key="expiryDate"
                verticalArrangedLargeTextIOS
                label="Expiry Date"
                // eslint-disable-next-line react/no-unstable-nested-components
                detail={({ textProps }) => (
                  <DateDisplay
                    textProps={textProps}
                    date={new Date(data.expiry_date || 0)}
                  />
                )}
              />,
            );
          }

          if (detailElements.length <= 0) return;

          return (
            <UIGroup header="Details" largeTitle>
              {UIGroup.ListItemSeparator.insertBetween(detailElements)}
            </UIGroup>
          );
        })()}
      </ScreenContent.ScrollView>
    </ScreenContent>
  );
}

function RFIDWriteIcon() {
  const { iosTintColor } = useColors();

  return (
    <View style={styles.customIconContainer}>
      <Svg height="50" width="50" viewBox="0 0 512 512">
        <Path
          fillRule="evenodd"
          clipRule="evenodd"
          d="M201.333 288.043H172.625C168.034 288.043 163.844 287.575 160.073 286.649C170.521 279.625 181.789 273.808 193.681 269.293H318.372C330.169 273.785 341.358 279.557 351.772 286.494C347.853 287.523 343.464 288.043 338.625 288.043H310.715C293.828 281.713 275.47 278.375 256.219 278.375C236.877 278.375 218.349 281.686 201.333 288.043ZM369.417 274.422C373.181 268.705 375.125 261.223 375.125 252.043V178.918C375.125 155.293 362.25 142.918 338.625 142.918H172.625C149 142.918 136 155.293 136 178.918V252.043C136 261.474 138.072 269.113 142.065 274.887C147.548 270.823 153.25 267.074 159.146 263.65C157.166 260.98 156.125 257.41 156.125 253.043V177.918C156.125 167.543 162 161.668 172.375 161.668H338.75C349.125 161.668 355 167.543 355 177.918V253.043C355 257.21 354.052 260.651 352.246 263.277C358.167 266.677 363.898 270.396 369.417 274.422Z"
          fill={iosTintColor}
        />
        <Rect
          x="184.5"
          y="202.5"
          width="35.6"
          height="35.6"
          rx="8"
          fill={iosTintColor}
        />
        <Rect
          x="238.5"
          y="202.5"
          width="35.6"
          height="35.6"
          rx="8"
          fill={iosTintColor}
          fillOpacity="0.5"
        />
        <Rect
          x="292.5"
          y="202.5"
          width="35.6"
          height="35.6"
          rx="8"
          fill={iosTintColor}
          fillOpacity="0.25"
        />
        <Path
          d="M374.969 320.25C379.219 316.375 379.719 309.625 374.719 304.875C343.594 275.125 301.844 258 256.219 258C210.594 258 168.469 274.875 137.594 304.875C132.594 309.625 133.094 316.375 137.344 320.25C141.719 324.125 147.844 323.25 152.594 318.75C179.469 292.625 216.094 278.375 256.219 278.375C296.344 278.375 332.594 292.875 359.719 318.75C364.469 323.25 370.719 324.125 374.969 320.25Z"
          fill={iosTintColor}
        />
        <Path
          d="M341.719 356.375C346.344 352.375 346.344 345.375 341.094 340.5C318.594 319.75 288.594 308.125 256.219 308.125C223.844 308.125 193.719 319.625 171.344 340.5C165.969 345.375 165.969 352.375 170.719 356.375C175.219 360.375 181.094 359.125 186.219 354.625C204.719 337.75 229.219 328.5 256.219 328.5C283.094 328.5 307.594 337.875 326.219 354.625C331.344 359.125 337.094 360.375 341.719 356.375Z"
          fill={iosTintColor}
        />
        <Path
          d="M306.094 391.375C310.719 387.25 310.844 379.75 305.219 375.375C291.719 364.5 274.594 358.125 256.219 358.125C237.844 358.125 220.594 364.5 207.219 375.375C201.469 379.75 201.594 387.25 206.344 391.375C210.844 395.375 216.344 393.625 221.844 389.75C231.219 382.375 243.219 378.5 256.219 378.5C269.219 378.5 281.219 382.25 290.594 389.75C295.969 393.75 301.594 395.375 306.094 391.375Z"
          fill={iosTintColor}
        />
      </Svg>
    </View>
  );
}

function RFIDLocateIcon() {
  const { iosTintColor } = useColors();

  return (
    <View style={styles.customIconContainer}>
      <Svg height="50" width="50" viewBox="0 0 512 512">
        <Path
          d="M144 213.75C150.625 213.75 154.125 210 154.125 203.5V174C154.125 161 161 154.375 173.5 154.375H203.75C210.375 154.375 214 150.75 214 144.25C214 137.75 210.375 134.25 203.75 134.25H173.25C147.125 134.25 134 147.125 134 172.875V203.5C134 210 137.625 213.75 144 213.75ZM368.625 213.75C375.25 213.75 378.75 210 378.75 203.5V172.875C378.75 147.125 365.625 134.25 339.5 134.25H308.875C302.375 134.25 298.75 137.75 298.75 144.25C298.75 150.75 302.375 154.375 308.875 154.375H339.125C351.5 154.375 358.625 161 358.625 174V203.5C358.625 210 362.25 213.75 368.625 213.75ZM173.25 378.875H203.75C210.375 378.875 214 375.25 214 368.875C214 362.375 210.375 358.75 203.75 358.75H173.5C161 358.75 154.125 352.125 154.125 339.125V309.625C154.125 303 150.5 299.375 144 299.375C137.5 299.375 134 303 134 309.625V340.125C134 366 147.125 378.875 173.25 378.875ZM308.875 378.875H339.5C365.625 378.875 378.75 365.875 378.75 340.125V309.625C378.75 303 375.125 299.375 368.625 299.375C362.125 299.375 358.625 303 358.625 309.625V339.125C358.625 352.125 351.5 358.75 339.125 358.75H308.875C302.375 358.75 298.75 362.375 298.75 368.875C298.75 375.25 302.375 378.875 308.875 378.875Z"
          fill={iosTintColor}
        />
        <Path
          d="M274.821 337.711C278.518 341.944 285.222 342.258 289.469 337.674C309.432 316.186 320.138 287.478 320.138 256.275C320.138 225.131 309.469 196.368 289.469 174.917C285.222 170.333 278.518 170.647 274.821 174.82C271.244 178.831 271.614 184.303 275.464 188.369C292.127 206.105 300.966 230.03 300.966 256.275C300.966 282.58 291.73 306.209 275.464 324.222C271.674 328.349 271.244 333.719 274.821 337.711Z"
          fill={iosTintColor}
        />
        <Path
          d="M249.229 312.906C252.944 317.435 259.446 318.095 264.912 312.513C278.257 298.609 284.965 278.129 284.965 256.275C284.965 234.542 277.615 213.202 264.912 200.096C259.446 194.496 252.944 195.097 249.229 199.704C245.754 203.853 247.02 208.927 250.689 213.05C260.518 223.839 265.792 239.421 265.792 256.275C265.792 273.17 260.499 288.752 250.689 299.56C247.02 303.622 245.754 308.678 249.229 312.906Z"
          fill={iosTintColor}
        />
        <Path
          d="M224.165 288.589C227.598 293.178 234.654 293.497 239.506 288.279C246.343 280.814 249.99 268.847 249.99 256.275C249.99 243.643 246.343 231.658 239.506 224.21C234.654 219.035 227.598 219.293 224.165 223.9C221.05 227.93 222.03 232.828 225.006 237.066C228.261 241.459 230.818 249.483 230.818 256.275C230.818 263.006 228.28 271.03 225.006 275.483C222.011 279.703 221.05 284.56 224.165 288.589Z"
          fill={iosTintColor}
        />
        <Path
          d="M177 256.118C177 265.121 184.802 272.645 193.962 272.645C203.122 272.645 210.707 265.121 210.707 255.96C210.707 246.602 203.279 239.077 193.962 239.077C184.663 239.077 177 246.879 177 256.118Z"
          fill={iosTintColor}
        />
      </Svg>
    </View>
  );
}

const DATE_DISPLAY_MODES = ['date', 'datetime', 'unix'] as const;
function DateDisplay({
  date,
  textProps,
}: {
  date: Date;
  textProps: React.ComponentProps<typeof RNText>;
}) {
  const [mode, setMode] = useState<(typeof DATE_DISPLAY_MODES)[number]>(
    DATE_DISPLAY_MODES[0],
  );
  const handleSwitchToNextMode = useCallback(() => {
    setMode(m => {
      const currentIndex = DATE_DISPLAY_MODES.indexOf(m);
      let nextIndex = currentIndex + 1;
      if (nextIndex > DATE_DISPLAY_MODES.length - 1) {
        nextIndex = 0;
      }

      return DATE_DISPLAY_MODES[nextIndex];
    });
  }, []);
  return (
    <TouchableWithoutFeedback onPress={handleSwitchToNextMode}>
      <View>
        <Text
          {...textProps}
          style={[
            textProps.style,
            mode === 'unix' ? commonStyles.fontMonospaced : {},
          ]}
        >
          {(() => {
            switch (mode) {
              case 'datetime':
                return (
                  date.toLocaleDateString() + ' ' + date.toLocaleTimeString()
                );
              case 'unix':
                return date.getTime().toString();
              default:
                return date.toLocaleDateString();
            }
          })()}
        </Text>
      </View>
    </TouchableWithoutFeedback>
  );
}

const styles = StyleSheet.create({
  buttonWithAnnotationText: {
    marginBottom: 7,
  },
  buttonAnnotationText: {
    position: 'absolute',
    bottom: -6,
    left: -15,
    right: -16,
    textAlign: 'center',
    fontSize: 8,
    fontWeight: '500',
  },
  customIconContainer: {
    marginVertical: -4,
    marginHorizontal: -4,
  },
  unitText: {
    opacity: 0.5,
    fontSize: 14,
  },
});

export default ItemScreen;