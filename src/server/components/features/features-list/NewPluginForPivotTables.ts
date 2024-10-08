import {Feature} from '../../../../shared';
import {createFeatureConfig} from '../utils';

export default createFeatureConfig({
    name: Feature.NewPluginForPivotTables,
    state: {
        development: true,
        production: true,
    },
});
