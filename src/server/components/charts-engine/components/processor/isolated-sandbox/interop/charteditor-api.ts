import fs from 'fs';
import path from 'path';

import type IsolatedVM from 'isolated-vm';

import {
    type IChartEditor,
    type IntervalPart,
    WRAPPED_FN_KEY,
    WRAPPED_HTML_KEY,
} from '../../../../../../../shared';

export type ChartEditorGetTranslation = (
    keyset: string,
    key: string,
    params?: Record<string, string | number | string[]>,
) => string;
export type ChartEditorGetSharedData = () => {
    [key: string]: object;
};

export type ChartEditorUserLang = string;
export type ChartEditorUserLogin = string;
export type ChartEditorAttachHandler = (handlerConfig: string) => string;
export type ChartEditorAttachFormatter = (formatterConfig: string) => string;
export type ChartEditorGetSecrets = () => {[key: string]: string};
export type ChartEditorResolveInterval = (interval: string) => {from: string; to: string} | null;
export type ChartEditorResolveOperation = (operation: string) => string | null;
export type ChartEditorSetError = (error: string) => undefined;
export type ChartEditorSetChartsInsights = (insights: string) => undefined;
export type ChartEditorGetWidgetConfig = () => string;
export type ChartEditorGetActionParams = () => string;
export type ChartEditorWrapFnWrappedFnKey = string;
export type ChartEditorWrapHtmlWrappedHtmlKey = string;
export type ChartEditorUpdateActionParams = (params: string) => undefined;
export type ChartEditorGetLoadedData = () => string;
export type ChartEditorGetLoadedDataStats = () => string;
export type ChartEditorSetDataSourceInfo = (dataSourceKey: string, info: string) => undefined;
export type ChartEditorUpdateConfig = (config: string) => undefined;
export type ChartEditorUpdateHighchartsConfig = (config: string) => undefined;
export type ChartEditorSetSideHtml = (html: string) => undefined;
export type ChartEditorSetSideMarkdown = (markdown: string) => undefined;
export type ChartEditorSetExtra = (key: string, value: string) => undefined;
export type ChartEditorSetExportFilename = (filename: string) => undefined;

export type ChartEditorResolveRelative = (
    stringrelativeStr: string,
    intervalPart?: IntervalPart,
) => string | null;

const prepare = fs.readFileSync(path.join(__dirname, 'charteditor-api-prepare.js'), 'utf-8');

export const getPrepareApiAdapter = ({noJsonFn = false}: {noJsonFn: boolean}) => {
    return `const noJsonFn = ${noJsonFn.toString()}; ${prepare}`;
};

export function prepareChartEditorApi({
    name,
    jail,
    chartEditorApi,
    userLogin,
}: {
    name: string;
    jail: IsolatedVM.Reference;
    chartEditorApi: IChartEditor;
    userLogin: string | null;
}) {
    jail.setSync('_ChartEditor_getTranslation', ((keyset, key, params) => {
        return chartEditorApi.getTranslation(keyset, key, params);
    }) satisfies ChartEditorGetTranslation);

    jail.setSync('_ChartEditor_getSharedData', (() => {
        return chartEditorApi.getSharedData();
    }) satisfies ChartEditorGetSharedData);

    jail.setSync('_ChartEditor_userLang', chartEditorApi.getLang() satisfies ChartEditorUserLang);

    jail.setSync('_ChartEditor_userLogin', (userLogin || '') satisfies ChartEditorUserLogin);

    jail.setSync('_ChartEditor_attachHandler', ((handlerConfig?: string) => {
        const parsedHandlerConfig = handlerConfig ? JSON.parse(handlerConfig) : undefined;
        return JSON.stringify(chartEditorApi.attachHandler(parsedHandlerConfig));
    }) satisfies ChartEditorAttachHandler);

    jail.setSync('_ChartEditor_attachFormatter', ((formatterConfig?: string) => {
        const parsedFormatterConfig = formatterConfig ? JSON.parse(formatterConfig) : undefined;
        return JSON.stringify(chartEditorApi.attachFormatter(parsedFormatterConfig));
    }) satisfies ChartEditorAttachFormatter);

    if (chartEditorApi.getSecrets) {
        jail.setSync('_ChartEditor_getSecrets', (() =>
            chartEditorApi.getSecrets()) satisfies ChartEditorGetSecrets);
    }

    jail.setSync('_ChartEditor_resolveRelative', ((...resolveRelativeParams) => {
        return chartEditorApi.resolveRelative(...resolveRelativeParams);
    }) satisfies ChartEditorResolveRelative);

    jail.setSync('_ChartEditor_resolveInterval', ((intervalStr: string) => {
        return chartEditorApi.resolveInterval(intervalStr);
    }) satisfies ChartEditorResolveInterval);

    jail.setSync('_ChartEditor_resolveOperation', ((input: string) => {
        return JSON.stringify(chartEditorApi.resolveOperation(input));
    }) satisfies ChartEditorResolveOperation);

    jail.setSync('_ChartEditor_setError', ((value?: string) => {
        const parsedValue = value ? JSON.parse(value) : undefined;
        chartEditorApi.setError(parsedValue);
    }) satisfies ChartEditorSetError);

    jail.setSync('_ChartEditor_setChartsInsights', ((input?: string) => {
        const parsedInput = input ? JSON.parse(input) : undefined;
        chartEditorApi.setChartsInsights(parsedInput);
    }) satisfies ChartEditorSetChartsInsights);

    jail.setSync('_ChartEditor_getWidgetConfig', (() => {
        const widgetConfig = chartEditorApi.getWidgetConfig
            ? chartEditorApi.getWidgetConfig()
            : null;
        return JSON.stringify(widgetConfig);
    }) satisfies ChartEditorGetWidgetConfig);

    jail.setSync('_ChartEditor_getActionParams', (() => {
        const actionParams = chartEditorApi.getActionParams
            ? chartEditorApi.getActionParams()
            : null;
        return JSON.stringify(actionParams);
    }) satisfies ChartEditorGetActionParams);

    jail.setSync(
        '_ChartEditor_wrapFn_WRAPPED_FN_KEY',
        WRAPPED_FN_KEY satisfies ChartEditorWrapFnWrappedFnKey,
    );
    jail.setSync(
        '_ChartEditor_wrapHtml_WRAPPED_HTML_KEY',
        WRAPPED_HTML_KEY satisfies ChartEditorWrapHtmlWrappedHtmlKey,
    );

    if (name === 'Params' || name === 'JavaScript' || name === 'UI' || name === 'Urls') {
        jail.setSync('_ChartEditor_updateActionParams', ((updateActionParams?: string) => {
            const parsedUpdateActionParams = updateActionParams
                ? JSON.parse(updateActionParams)
                : undefined;
            JSON.stringify(chartEditorApi.updateActionParams(parsedUpdateActionParams));
        }) satisfies ChartEditorUpdateActionParams);
    }

    if (name === 'UI' || name === 'JavaScript') {
        jail.setSync('_ChartEditor_getLoadedData', (() => {
            // There may be objects inside the uploaded data that cannot be transferred
            const loadedData = chartEditorApi.getLoadedData();
            return JSON.stringify(loadedData);
        }) satisfies ChartEditorGetLoadedData);
        jail.setSync('_ChartEditor_getLoadedDataStats', (() => {
            const loadedDataStats = chartEditorApi.getLoadedDataStats();
            return JSON.stringify(loadedDataStats);
        }) satisfies ChartEditorGetLoadedDataStats);
        jail.setSync('_ChartEditor_setDataSourceInfo', ((dataSourceKey: string, info?: string) => {
            const parsedInfo = info ? JSON.parse(info) : undefined;
            chartEditorApi.setDataSourceInfo(dataSourceKey, parsedInfo);
        }) satisfies ChartEditorSetDataSourceInfo);
        if (name === 'JavaScript') {
            jail.setSync('_ChartEditor_updateConfig', ((updatedFragment?: string) => {
                const parsedUpdatedFragment = updatedFragment
                    ? JSON.parse(updatedFragment)
                    : undefined;
                chartEditorApi.updateConfig(parsedUpdatedFragment);
            }) satisfies ChartEditorUpdateConfig);
            jail.setSync('_ChartEditor_updateHighchartsConfig', ((updatedFragment?: string) => {
                const parsedUpdatedFragment = updatedFragment
                    ? JSON.parse(updatedFragment)
                    : undefined;
                chartEditorApi.updateHighchartsConfig(parsedUpdatedFragment);
            }) satisfies ChartEditorUpdateHighchartsConfig);
            jail.setSync('_ChartEditor_setSideHtml', ((html: string) => {
                chartEditorApi.setSideHtml(html);
            }) satisfies ChartEditorSetSideHtml);
            jail.setSync('_ChartEditor_setSideMarkdown', ((markdown: string) => {
                chartEditorApi.setSideMarkdown(markdown);
            }) satisfies ChartEditorSetSideMarkdown);
            jail.setSync('_ChartEditor_setExtra', ((key: string, value?: string) => {
                const parsedValue = value ? JSON.parse(value) : undefined;
                chartEditorApi.setExtra(key, parsedValue);
            }) satisfies ChartEditorSetExtra);
            jail.setSync('_ChartEditor_setExportFilename', ((filename: string) => {
                chartEditorApi.setExportFilename(filename);
            }) satisfies ChartEditorSetExportFilename);
        }
    }
    return jail;
}
