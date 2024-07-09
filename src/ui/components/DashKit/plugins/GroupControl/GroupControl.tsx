import React from 'react';

import type {Plugin, PluginWidgetProps, SettingsProps} from '@gravity-ui/dashkit';
import type {Config, StateAndParamsMetaData} from '@gravity-ui/dashkit/helpers';
import {getItemsParams, pluginGroupControlBaseDL} from '@gravity-ui/dashkit/helpers';
import {Loader} from '@gravity-ui/uikit';
import block from 'bem-cn-lite';
import {I18n} from 'i18n';
import type {DatalensGlobalState} from 'index';
import debounce from 'lodash/debounce';
import isEqual from 'lodash/isEqual';
import {connect} from 'react-redux';
import type {DashTabItemControlSingle, DashTabItemGroupControlData, StringParams} from 'shared';
import {ControlQA, DashTabItemType} from 'shared';
import {CHARTKIT_SCROLLABLE_NODE_CLASSNAME} from 'ui/libs/DatalensChartkit/ChartKit/helpers/constants';
import {ControlButton} from 'ui/libs/DatalensChartkit/components/Control/Items/Items';
import {
    CLICK_ACTION_TYPE,
    CONTROL_TYPE,
} from 'ui/libs/DatalensChartkit/modules/constants/constants';
import type {ActiveControl} from 'ui/libs/DatalensChartkit/types';
import {getUrlGlobalParams} from 'ui/units/dash/utils/url';
import {isMobileView} from 'ui/utils/mobile';

import {
    selectCurrentTab,
    selectDashGlobalDefaultParams,
    selectIsNewRelations,
    selectSkipReload,
    selectTabHashState,
} from '../../../../units/dash/store/selectors/dashTypedSelectors';
import {DEFAULT_CONTROL_LAYOUT} from '../../constants';
import {adjustWidgetLayout} from '../../utils';
import {LOAD_STATUS} from '../Control/constants';
import type {ControlSettings, GetDistincts, LoadStatus} from '../Control/types';
import DebugInfoTool from '../DebugInfoTool/DebugInfoTool';

import {Control} from './Control/Control';
import type {
    ContextProps,
    ExtendedLoadedData,
    GroupControlLocalMeta,
    PluginGroupControlState,
    ResolveMetaResult,
} from './types';
import {addItemToLocalQueue, filterSignificantParams} from './utils';

import './GroupControl.scss';

const GROUP_CONTROL_LAYOUT_DEBOUNCE_TIME = 20;

type StateProps = ReturnType<typeof mapStateToProps>;

type OwnProps = ControlSettings &
    ContextProps &
    PluginWidgetProps<Record<string, StringParams>> & {
        settings: SettingsProps & {
            dependentSelectors?: boolean;
        };
    };

type PluginGroupControlProps = OwnProps & StateProps;

type PluginGroupControl = Plugin<PluginGroupControlProps, Record<string, StringParams>> & {
    setSettings: (settings: ControlSettings) => Plugin;
    getDistincts?: GetDistincts;
};
const b = block('dashkit-plugin-group-control');
const i18n = I18n.keyset('dash.dashkit-plugin-control.view');

const LOCAL_META_VERSION = 2;

class GroupControl extends React.PureComponent<PluginGroupControlProps, PluginGroupControlState> {
    rootNode: React.RefObject<HTMLDivElement> = React.createRef<HTMLDivElement>();

    _isUnmounted = false;

    adjustWidgetLayout = debounce(this.setAdjustWidgetLayout, GROUP_CONTROL_LAYOUT_DEBOUNCE_TIME);

    resolve: ((value: unknown) => void) | null = null;

    controlsLoadedCount = 0;
    controlsProgressCount = 0;
    controlsStatus: Record<string, LoadStatus> = {};
    controlsData: Record<string, ExtendedLoadedData | null> = {};

    // a quick loader for imitating action by clicking on apply button
    quickActionLoader = false;

    // params of current dash state
    initialParams: Record<string, StringParams> = {};

    localMeta: GroupControlLocalMeta = {version: LOCAL_META_VERSION, queue: []};

    constructor(props: PluginGroupControlProps) {
        super(props);
        const {data} = this.props;
        const controlData = data as unknown as DashTabItemGroupControlData;

        this.controlsProgressCount = controlData?.group?.length || 0;
        controlData.group?.forEach((item) => {
            this.controlsStatus[item.id] = LOAD_STATUS.INITIAL;
            this.controlsData[item.id] = null;
        });

        let stateParams: Record<string, StringParams>;

        // to apply initial params from dash state inside group
        if (controlData.updateControlsOnChange) {
            this.fillQueueWithInitial(true);

            stateParams = this.getUpdatedGroupParams({
                params: this.props.params,
            });
        } else {
            stateParams = this.props.params;
        }

        this.initialParams = stateParams;

        this.state = {
            status: LOAD_STATUS.INITIAL,
            silentLoading: false,
            isInit: false,
            stateParams,
            needReload: false,
            localUpdateLoader: false,
        };
    }

    componentDidMount() {
        this.init();
    }

    componentDidUpdate(prevProps: Readonly<PluginGroupControlProps>) {
        if (this.rootNode.current) {
            if (this.props.data.autoHeight) {
                // if the "Auto-height" flag is set
                this.adjustWidgetLayout(false);
            } else if (prevProps.data.autoHeight) {
                // if the "Auto-height" flag was set and then removed
                this.adjustWidgetLayout(true);
            }
        }

        const hasDataChanged = !isEqual(this.props.data, prevProps.data);
        const hasParamsChanged = !isEqual(this.props.params, prevProps.params);

        if (hasDataChanged) {
            this.setState({
                status: LOAD_STATUS.PENDING,
                needReload: true,
                silentLoading: true,
            });
        }

        if (hasParamsChanged || hasDataChanged) {
            if (!this.props.data.buttonApply) {
                this.setState({
                    stateParams: this.props.params,
                });
                return;
            }

            const updatedStateParams: Record<string, StringParams> = {};
            const updatedItemsIds: string[] = [];
            this.props.data.group?.forEach((groupItem) => {
                const newPropsParams = filterSignificantParams({
                    params: this.props.params[groupItem.id],
                    loadedData: this.controlsData[groupItem.id],
                    defaults: groupItem.defaults,
                    dependentSelectors: this.dependentSelectors,
                });

                const initialParams = filterSignificantParams({
                    params: this.initialParams[groupItem.id],
                    loadedData: this.controlsData[groupItem.id],
                    defaults: groupItem.defaults,
                    dependentSelectors: this.dependentSelectors,
                });

                if (isEqual(initialParams, newPropsParams)) {
                    updatedStateParams[groupItem.id] = {...this.state.stateParams[groupItem.id]};
                } else {
                    updatedStateParams[groupItem.id] = {...this.props.params[groupItem.id]};
                    this.initialParams[groupItem.id] = {...this.props.params[groupItem.id]};
                    updatedItemsIds.push(groupItem.id);
                }
            });

            if (
                this.props.data.updateControlsOnChange &&
                (updatedItemsIds.length || !prevProps.data.updateControlsOnChange)
            ) {
                if (prevProps.data.updateControlsOnChange) {
                    updatedItemsIds.forEach((queueItemId) => {
                        this.localMeta.queue = addItemToLocalQueue(
                            this.localMeta.queue,
                            this.props.id,
                            queueItemId,
                        );
                    });
                } else {
                    // if the update setting is enabled in this render, then we must
                    // apply the current internal parameters so fill queue for filled values
                    this.fillQueueWithInitial();
                }
                const locallyUpdatedParams = this.getUpdatedGroupParams({
                    params: updatedStateParams,
                });

                this.setState({stateParams: locallyUpdatedParams});
                return;
            }

            this.setState({
                stateParams: updatedStateParams,
            });
        }
    }

    componentWillUnmount() {
        this._isUnmounted = true;
    }

    render() {
        const isLoading =
            (this.state.status === LOAD_STATUS.PENDING && !this.state.silentLoading) ||
            this.quickActionLoader ||
            this.state.localUpdateLoader;

        return (
            <div
                ref={this.rootNode}
                className={b({mobile: isMobileView, static: !this.props.data.autoHeight})}
            >
                <div
                    className={b('container', CHARTKIT_SCROLLABLE_NODE_CLASSNAME)}
                    data-qa={ControlQA.groupChartkitControl}
                >
                    <DebugInfoTool
                        label="widgetId"
                        value={this.props.id}
                        modType="bottom-right-corner"
                    />
                    {this.renderControls()}
                    {isLoading && (
                        <div className={b('loader')}>
                            <Loader size="s" qa={ControlQA.groupCommonLoader} />
                        </div>
                    )}
                </div>
            </div>
        );
    }

    private get dependentSelectors() {
        return this.props.settings.dependentSelectors ?? false;
    }

    private fillQueueWithInitial = (checkByProps?: boolean) => {
        const initialQueue: string[] = [];

        for (const groupItem of this.props.data.group || []) {
            if (!groupItem.defaults) {
                continue;
            }
            const param = Object.keys(groupItem.defaults)[0];
            const defaultItemParam = groupItem.defaults[param];

            const isItemSignificant = checkByProps
                ? this.props.params[groupItem.id][param] !== defaultItemParam
                : this.state.stateParams[groupItem.id][param] !== defaultItemParam;

            if (isItemSignificant) {
                initialQueue.push(groupItem.id);
            }
        }

        initialQueue.forEach((queueItemId) => {
            this.localMeta.queue = addItemToLocalQueue(
                this.localMeta.queue,
                this.props.id,
                queueItemId,
            );
        });
    };

    private getControlsIds = ({
        data,
        controlId,
    }: {
        data: DashTabItemGroupControlData;
        controlId?: string;
    }) => {
        let controlIdOrder = data.group.map(({id}) => id);

        if (!data.buttonApply || controlId) {
            return controlId ? [controlId] : controlIdOrder;
        }

        // processing alias params so that the param from the alias that was entered last is applied
        // to all params from that alias

        const paramsInGroup = data.group.map(
            (groupItem) => Object.keys(groupItem.defaults || {})[0],
        );

        const currentNamespaceAliases = this.props.currentTabConfig?.aliases[this.props.namespace];
        // we leave only aliases that involve two or more selectors from the group
        const groupAliasesList = currentNamespaceAliases
            ? currentNamespaceAliases.reduce((aliasArr: string[][], currentAlias) => {
                  let participationInGroupCount = 0;
                  for (const alias of currentAlias) {
                      if (paramsInGroup.includes(alias)) {
                          participationInGroupCount++;
                      }

                      if (participationInGroupCount >= 2) {
                          aliasArr.push(currentAlias);
                          break;
                      }
                  }

                  return aliasArr;
              }, [])
            : [];

        // for each alias, we swap the positions in the queue
        // only the selectors included in the current alias are swapped
        // the last applied selector from the alias becomes the closest to the end of the queue
        groupAliasesList.forEach((alias) => {
            const placementOrderIds: string[] = [];

            // save the current order of selectors
            controlIdOrder.forEach((id) => {
                const usedParams = this.controlsData[id]?.uiScheme;
                const control = Array.isArray(usedParams) ? usedParams[0] : usedParams?.controls[0];
                if (control && 'param' in control && alias.includes(control.param)) {
                    placementOrderIds.push(id);
                }
            });

            // ids from the selector change queue
            const queueOrderIds: string[] = [];
            // selectors from alias that havn't been changed yet. they should be added to the top of queue
            const outQueueIds: string[] = [];

            this.localMeta.queue.forEach(({groupItemId, param}) => {
                if (groupItemId && param && alias.includes(param)) {
                    queueOrderIds.push(groupItemId);
                }
            });

            placementOrderIds.forEach((id) => {
                if (!queueOrderIds.includes(id)) {
                    outQueueIds.push(id);
                }
            });

            // final order in which alias selectors should be applied
            const changedOrderIds: string[] = outQueueIds.concat(queueOrderIds);

            let currentPlacementIndex = 0;

            // we replace each selector from placementOrderIds with a selector fromchangedOrderIds
            controlIdOrder = controlIdOrder.map((id) => {
                if (
                    placementOrderIds[currentPlacementIndex] === id &&
                    changedOrderIds[currentPlacementIndex]
                ) {
                    const newControlId = changedOrderIds[currentPlacementIndex];
                    currentPlacementIndex++;
                    return newControlId;
                }
                return id;
            });
        });

        return controlIdOrder;
    };

    private onChange = ({
        params,
        callChangeByClick,
        controlId,
    }: {
        params: StringParams | Record<string, StringParams>;
        callChangeByClick?: boolean;
        controlId?: string;
    }) => {
        const controlData = this.props.data as unknown as DashTabItemGroupControlData;

        // In cases:
        // 1. 'Apply button' is clicked
        // 2. 'Apply button' isn't enabled
        if (!controlData.buttonApply || callChangeByClick) {
            this.props.onStateAndParamsChange(
                {params},
                {groupItemIds: this.getControlsIds({data: controlData, controlId})},
            );
            this.localMeta.queue = [];
            return;
        }

        // Change params by control when 'Apply button' is enabled
        if (controlId) {
            if (controlData.buttonApply) {
                this.localMeta.queue = addItemToLocalQueue(
                    this.localMeta.queue,
                    this.props.id,
                    controlId,
                    // need name of control main param for alias case
                    Object.keys(params)[0],
                );
            }
            if (controlData.updateControlsOnChange && controlData.buttonApply) {
                this.setState({
                    stateParams: this.getLocalUpdatedParams(controlId, params),
                    localUpdateLoader: true,
                });
            } else {
                this.setState({
                    stateParams: {
                        ...this.state.stateParams,
                        [controlId]: {
                            ...this.state.stateParams[controlId],
                            ...params,
                        } as StringParams,
                    },
                });
            }
            return;
        }

        // Reset by 'Reset button' when 'Apply button' is enabled
        this.setState({stateParams: params as Record<string, StringParams>});
        this.localMeta.queue = [];
    };

    private getUpdatedGroupParams = ({
        params,
        meta,
    }: {
        params: Record<string, StringParams>;
        meta?: StateAndParamsMetaData;
    }) => {
        const defaultGlobalParams = this.props.defaultGlobalParams || {};

        const currentConfigItem = {
            id: this.props.id,
            data: this.props.data,
            type: DashTabItemType.GroupControl,
            namespace: this.props.namespace,
        };

        // we simulate the dash config and include only the context of group control in it
        // to get changed params considering aliases and relations only inside group
        const updatedStateParams = getItemsParams({
            config: {
                ...this.props.currentTabConfig,
                items: [currentConfigItem],
            } as Config,
            itemsStateAndParams: {
                [this.props.id]: {params},
                __meta__: meta || this.localMeta,
            },
            plugins: [pluginGroupControlBaseDL],
            defaultGlobalParams,
            globalParams: getUrlGlobalParams(window.location.search, defaultGlobalParams) || {},
            useStateAsInitial: true,
        });

        return updatedStateParams[this.props.id] as Record<string, StringParams>;
    };

    private getLocalUpdatedParams = (
        controlId: string,
        params: StringParams | Record<string, StringParams>,
    ) => {
        const newParams: Record<string, StringParams> = {
            ...this.state.stateParams,
            [controlId]: {...this.state.stateParams[controlId], ...params} as StringParams,
        };

        return this.getUpdatedGroupParams({params: newParams});
    };

    // public
    // @ts-ignore
    private getMeta() {
        return new Promise((resolve) => {
            this.resolve = resolve;

            if (this.state.status === LOAD_STATUS.SUCCESS) {
                this.resolveMetaInControl();
            }
        });
    }

    private filterDefaultsBySource(item: DashTabItemControlSingle) {
        const sourcedFieldId =
            item.sourceType === 'dataset'
                ? (item.source as {datasetFieldId: string})?.datasetFieldId
                : null;
        if (sourcedFieldId && item.defaults) {
            return {[sourcedFieldId]: item.defaults[sourcedFieldId]};
        }

        return item.defaults;
    }

    private getCurrentWidgetResolvedMetaInfo = (
        id: string,
        loadedData: ExtendedLoadedData | null,
    ) => {
        let label = '';
        if (loadedData?.uiScheme && 'controls' in loadedData.uiScheme) {
            const controls = loadedData.uiScheme.controls as ActiveControl[];
            label = controls[0].label;
        }

        const currentItem = (this.props.data as unknown as DashTabItemGroupControlData).group?.find(
            (item) => item.id === id,
        );

        const widgetMetaInfo = {
            layoutId: this.props.id,
            widgetId: this.props.id,
            title: currentItem?.title,
            label,
            params: loadedData?.params,
            defaultParams: currentItem ? this.filterDefaultsBySource(currentItem) : {},
            loaded: Boolean(loadedData),
            itemId: id,
            usedParams: loadedData?.usedParams
                ? Object.keys(
                      filterSignificantParams({
                          params: loadedData.usedParams,
                          loadedData,
                          defaults: currentItem?.defaults,
                          dependentSelectors: this.dependentSelectors,
                      }),
                  )
                : null,
            datasets: loadedData?.extra?.datasets || null,
            datasetId: loadedData?.sources?.fields?.datasetId || '',
            type: 'control',
            sourceType: loadedData?.sourceType,
            loadError: !loadedData,
        };

        return widgetMetaInfo;
    };

    private resolveMeta = (loadedData: ExtendedLoadedData | null) => {
        if (!loadedData) {
            return null;
        }

        const {id, extra, usedParams, sourceType} = loadedData;
        let result: ResolveMetaResult = {id};
        if (extra) {
            result = {
                id,
                usedParams: usedParams
                    ? Object.keys(
                          filterSignificantParams({
                              params: usedParams,
                              loadedData,
                              dependentSelectors: this.dependentSelectors,
                          }),
                      )
                    : null,
                datasets: extra.datasets,
                // deprecated
                datasetId: extra.datasetId,
                datasetFields: extra.datasetFields,
                type: 'control',
                sourceType,
            };
        }

        return result;
    };

    private resolveMetaInControl = () => {
        if (!this.resolve) {
            return;
        }

        const result = [];

        for (const [id, data] of Object.entries(this.controlsData)) {
            if (this.props.isNewRelations) {
                result.push(this.getCurrentWidgetResolvedMetaInfo(id, data));
            } else {
                result.push(this.resolveMeta(data));
            }
        }

        this.resolve(result);
    };

    private handleStatusChanged = ({
        controlId,
        status,
        loadedData,
    }: {
        controlId: string;
        status: LoadStatus;
        loadedData?: ExtendedLoadedData | null;
    }) => {
        if (this._isUnmounted) {
            return;
        }

        if (status === LOAD_STATUS.DESTROYED) {
            delete this.controlsData[controlId];
            delete this.controlsStatus[controlId];

            if (
                this.controlsStatus[controlId] === LOAD_STATUS.PENDING ||
                this.controlsStatus[controlId] === LOAD_STATUS.INITIAL
            ) {
                this.controlsProgressCount--;
                return;
            }

            this.controlsLoadedCount--;
            return;
        }

        const isLoaded = status === LOAD_STATUS.SUCCESS || status === LOAD_STATUS.FAIL;
        // for adding new control to existing group control
        const isInitialPending = !this.controlsStatus[controlId] && status === LOAD_STATUS.PENDING;
        const isReloadPending =
            this.controlsStatus[controlId] !== LOAD_STATUS.INITIAL &&
            status === LOAD_STATUS.PENDING;

        if (isLoaded) {
            this.controlsLoadedCount++;
            this.controlsProgressCount--;
            if (loadedData || loadedData === null) {
                this.controlsData[controlId] = loadedData;
            }
        } else if (isInitialPending) {
            this.controlsProgressCount++;
        } else if (isReloadPending) {
            this.controlsLoadedCount--;
            this.controlsProgressCount++;
        }

        if (!this.controlsProgressCount) {
            // adjust widget layout only for the first loading of widget
            if (this.props.data.autoHeight && !this.state.isInit) {
                this.adjustWidgetLayout(false);
            }

            this.resolveMetaInControl();
            this.setState({
                needReload: false,
                status: LOAD_STATUS.SUCCESS,
                silentLoading: false,
                isInit: true,
                localUpdateLoader: false,
            });
        }

        this.controlsStatus[controlId] = status;
    };

    private renderControl(item: DashTabItemControlSingle) {
        const {getDistincts, workbookId} = this.props;
        const {silentLoading} = this.state;

        return (
            <Control
                key={item.id}
                id={item.id}
                data={item}
                params={this.state.stateParams[item.id] || {}}
                onStatusChanged={this.handleStatusChanged}
                silentLoading={silentLoading}
                getDistincts={getDistincts}
                onChange={this.onChange}
                needReload={this.state.needReload}
                workbookId={workbookId}
                dependentSelectors={this.dependentSelectors}
            />
        );
    }

    private applyButtonAction(action: string) {
        let newParams = {};
        let callChangeByClick = true;

        switch (action) {
            case CLICK_ACTION_TYPE.SET_PARAMS:
                newParams = this.state.stateParams;
                break;
            case CLICK_ACTION_TYPE.SET_INITIAL_PARAMS: {
                const defaultParams =
                    this.props.data?.group?.reduce(
                        (paramsState: Record<string, StringParams>, data) => {
                            paramsState[data.id] = data.defaults || {};
                            return paramsState;
                        },
                        {},
                    ) || this.state.stateParams;
                newParams = this.getUpdatedGroupParams({
                    params: defaultParams,
                    meta: {version: LOCAL_META_VERSION, queue: []},
                });

                // if apply button is enabled, we apply new params only via click on 'Apply'
                if (this.props.data.buttonApply) {
                    callChangeByClick = false;
                }
                break;
            }
        }

        // changes are applied if:
        // 1. it's SET_INITIAL_PARAMS. empty values in required selectors are not recorded in the state
        // button reset need to reset them to the default value
        // 2. new params are not equal to the actual params in stateParams (e.x. reset params by button)
        // 3. new params are not equal to the props params (e.x. apply stateParams with apply button)
        if (
            action === CLICK_ACTION_TYPE.SET_INITIAL_PARAMS ||
            !isEqual(newParams, this.state.stateParams) ||
            !isEqual(newParams, this.props.params)
        ) {
            if (action === CLICK_ACTION_TYPE.SET_PARAMS) {
                this.quickActionLoader = true;
                setTimeout(() => {
                    this.quickActionLoader = false;
                });
            }
            this.onChange({params: newParams, callChangeByClick});
        }
    }

    private handleApplyChange = () => {
        this.applyButtonAction(CLICK_ACTION_TYPE.SET_PARAMS);
    };

    private handleResetChange = () => {
        this.applyButtonAction(CLICK_ACTION_TYPE.SET_INITIAL_PARAMS);
    };

    private renderButtons() {
        const {data} = this.props;
        const controlData = data as unknown as DashTabItemGroupControlData;

        const resetAction = {action: CLICK_ACTION_TYPE.SET_INITIAL_PARAMS};

        return (
            <React.Fragment>
                {controlData.buttonApply && (
                    <ControlButton
                        type={CONTROL_TYPE.BUTTON}
                        label={i18n('button_apply')}
                        updateOnChange={true}
                        theme="action"
                        className={b('item')}
                        onChange={this.handleApplyChange}
                        qa={ControlQA.controlButtonApply}
                    />
                )}
                {controlData.buttonReset && (
                    <ControlButton
                        type={CONTROL_TYPE.BUTTON}
                        className={b('item')}
                        label={i18n('button_reset')}
                        onClick={resetAction}
                        onChange={this.handleResetChange}
                        qa={ControlQA.controlButtonReset}
                    />
                )}
            </React.Fragment>
        );
    }

    private renderControls() {
        const {data} = this.props;
        const controlData = data as unknown as DashTabItemGroupControlData;

        return (
            <div className={b('controls')}>
                {controlData.group?.map((item: DashTabItemControlSingle) =>
                    this.renderControl(item),
                )}
                {this.renderButtons()}
            </div>
        );
    }

    // @ts-ignore
    // need for autoreload from dashkit
    private reload({silentLoading}: {silentLoading?: boolean}) {
        if (this.props.skipReload || !this.state.isInit || this._isUnmounted) {
            return;
        }

        this.setState({
            needReload: true,
            status: LOAD_STATUS.PENDING,
            silentLoading: Boolean(silentLoading),
        });
    }

    private async init() {
        if (this._isUnmounted) {
            return;
        }

        this.setState({
            status: LOAD_STATUS.PENDING,
        });
    }

    private setAdjustWidgetLayout(needSetDefault: boolean) {
        adjustWidgetLayout({
            widgetId: this.props.id,
            needSetDefault,
            rootNode: this.rootNode,
            gridLayout: this.props.gridLayout,
            layout: this.props.layout,
            cb: this.props.adjustWidgetLayout,
        });
    }
}

const mapStateToProps = (state: DatalensGlobalState) => ({
    defaultGlobalParams: selectDashGlobalDefaultParams(state),
    currentTabConfig: selectCurrentTab(state),
    skipReload: selectSkipReload(state),
    isNewRelations: selectIsNewRelations(state),
    currentState: selectTabHashState(state),
});

const GroupControlWithStore = connect(mapStateToProps, null, null, {
    forwardRef: true,
})(GroupControl);

const plugin: PluginGroupControl = {
    type: DashTabItemType.GroupControl,
    defaultLayout: DEFAULT_CONTROL_LAYOUT,
    setSettings(settings: ControlSettings) {
        const {getDistincts} = settings;

        // TODO: remove this. use basic ChartKit abilities
        plugin.getDistincts = getDistincts;

        return plugin;
    },
    renderer(props, forwardedRef) {
        const workbookId = props.context.workbookId;

        return (
            <GroupControlWithStore
                {...props}
                getDistincts={plugin.getDistincts}
                workbookId={workbookId}
                ref={forwardedRef}
            />
        );
    },
};

export default plugin;
