import type {Request, Response} from '@gravity-ui/expresskit';

import {EntryScope, TENANT_ID_HEADER} from '../../shared';
import {registry} from '../registry';
import type {DatalensGatewaySchemas} from '../types/gateway';
import Utils from '../utils';
import type {GatewayApiErrorResponse} from '../utils/gateway';

/* eslint-disable consistent-return */
export default async (req: Request, res: Response): Promise<void> => {
    const {query, ctx} = req;

    const layoutConfig = await registry.useGetLayoutConfig({
        req,
        res,
        settingsId: 'navigation',
    });

    let entry;

    if (query && query.path) {
        try {
            const {currentTenantId} = res.locals;

            const key = (query.path as string).replace(/^\//, '');

            ctx.log('GET_ENTRY_BY_KEY_REQUEST', {key});

            const {gatewayApi} = registry.getGatewayApi<DatalensGatewaySchemas>();
            const {responseData} = await gatewayApi.us.getEntryByKey({
                ctx,
                headers: {
                    ...req.headers,
                    [TENANT_ID_HEADER]: currentTenantId,
                    ...(req.ctx.config.isZitadelEnabled ? {...Utils.pickZitadelHeaders(req)} : {}),
                },
                requestId: req.id,
                authArgs: {iamToken: res.locals.iamToken},
                args: {key},
            });

            entry = responseData;

            ctx.log('GET_ENTRY_BY_KEY_SUCCESS', {entryId: entry.entryId});
        } catch (e) {
            const {error} = e as GatewayApiErrorResponse<Error>;
            ctx.logError('GET_ENTRY_BY_KEY_FAILED', error);

            res.send(res.renderDatalensLayout(layoutConfig));

            return;
        }
    }

    if (entry) {
        switch (entry.scope) {
            case EntryScope.Folder:
                return res.redirect(`/navigation/${entry.entryId}`);
            case EntryScope.Dataset:
                return res.redirect(`/datasets/${entry.entryId}`);
            case EntryScope.Widget:
                return res.redirect(`/wizard/${entry.entryId}`);
            case EntryScope.Dash:
                return res.redirect(`/${entry.entryId}`);
            case EntryScope.Connection:
                return res.redirect(`/connections/${entry.entryId}`);
            case EntryScope.Report:
                return res.redirect(`/reports/${entry.entryId}`);
            default:
                return res.redirect('/navigation');
        }
    } else {
        res.send(res.renderDatalensLayout(layoutConfig));
        return;
    }
};
