import {expect} from '@playwright/test';

import {
    ChartKitQa,
    DialogFieldBarsSettingsQa,
    WizardPageQa,
    WizardVisualizationId,
} from '../../../../../src/shared';
import {PlaceholderName} from '../../../../page-objects/wizard/SectionVisualization';
import WizardPage from '../../../../page-objects/wizard/WizardPage';
import {openTestPage, slct} from '../../../../utils';
import datalensTest from '../../../../utils/playwright/globalTestDefinition';

datalensTest.describe('Wizard', () => {
    datalensTest.describe('Flat table', () => {
        datalensTest.beforeEach(async ({page, config}) => {
            await openTestPage(page, config.wizard.urls.WizardBasicDataset);

            const wizardPage = new WizardPage({page});
            await wizardPage.setVisualization(WizardVisualizationId.FlatTable);
        });

        datalensTest('Pinned columns @screenshot', async ({page}) => {
            const wizardPage = new WizardPage({page});

            await wizardPage.sectionVisualization.addFieldByClick(
                PlaceholderName.FlatTableColumns,
                'City',
            );
            await wizardPage.sectionVisualization.addFieldByClick(
                PlaceholderName.FlatTableColumns,
                'postal_code',
            );
            await wizardPage.createNewFieldWithFormula('SalesSum', 'sum(float([Sales]))');
            await wizardPage.sectionVisualization.addFieldByClick(
                PlaceholderName.FlatTableColumns,
                'SalesSum',
            );
            await wizardPage.sectionVisualization.addFieldByClick(
                PlaceholderName.FlatTableColumns,
                'product_name',
            );

            // Add a linear indicator to check that it is not visible through the pinned columns
            await wizardPage.visualizationItemDialog.open(
                PlaceholderName.FlatTableColumns,
                'SalesSum',
            );
            await wizardPage.page.locator(slct(DialogFieldBarsSettingsQa.EnableButton)).click();
            await wizardPage.visualizationItemDialog.clickOnApplyButton();

            await wizardPage.columnSettings.open();
            await wizardPage.columnSettings.switchUnit('product_name', 'percent');
            await wizardPage.columnSettings.fillWidthValueInput('product_name', '100');
            await wizardPage.columnSettings.setPinnedColumns(2);
            await wizardPage.columnSettings.apply();

            const chartContainer = page.locator(slct(WizardPageQa.SectionPreview));
            const previewLoader = chartContainer.locator(slct(ChartKitQa.Loader));
            const table = wizardPage.chartkit.getTableLocator();
            await table.hover({position: {x: 10, y: 10}});

            await expect(previewLoader).not.toBeVisible();
            await expect(chartContainer).toHaveScreenshot();

            await page.mouse.wheel(50, 0);
            await expect(chartContainer).toHaveScreenshot();

            await page.mouse.wheel(10000, 0);
            await expect(chartContainer).toHaveScreenshot();
        });
    });
});
