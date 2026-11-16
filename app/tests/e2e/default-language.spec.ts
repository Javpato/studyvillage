import {test,expect} from '@playwright/test';
test.use({storageState:{cookies:[],origins:[]}});
for(const saved of [null,'unknown','es','fr','en'])test(`initial language with saved preference ${saved}`,async({page})=>{
 if(saved!==null)await page.addInitScript(value=>localStorage.setItem('studyvillage-language',value),saved);
 await page.goto('/');await expect(page.getByTestId('phone-button')).toBeVisible();
 await expect(page.locator('html')).toHaveAttribute('lang',saved==='es'||saved==='fr'?saved:'en');
 if(saved===null){await expect(page.getByTestId('board-pencil-mode')).toHaveAttribute('aria-label','Pen mode');await page.reload();await expect(page.locator('html')).toHaveAttribute('lang','en');}
});
