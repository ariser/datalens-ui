import {Feature} from '../../../../shared';
import {createFeatureConfig} from '../utils';

export default createFeatureConfig({
    name: Feature.PinnedColumns,
    state: {
        development: true,
        production: true,
    },
});
