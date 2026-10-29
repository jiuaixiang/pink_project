export default async function(page) {
    const read = () => page.evaluate(() => {
        const scene = cc.director.getScene();
        let comp = null;
        const walk = (n) => { if (!n || comp) return; const c = n.getComponent('BattleViewComp'); if (c) { comp = c; return; } n.children.forEach(walk); };
        walk(scene);
        if (!comp) return null;
        return { selected: comp.selectedUnit, units: comp.battle.battleModel.units.length, guideStep: comp.guideStep, log: (window.__spyLog || []).slice(-6) };
    });
    const out = {};
    await page.mouse.click(310, 380); await page.waitForTimeout(800);
    out.draft = await read();
    await page.mouse.click(840, 622); await page.waitForTimeout(2500);
    out.battle = await read();
    await page.mouse.click(1160, 120); await page.waitForTimeout(800);
    out.afterSkip = await read();
    // 安装写入追踪（记录 selectedUnit 每次赋值与调用栈来源）
    await page.evaluate(() => {
        const scene = cc.director.getScene();
        let comp = null;
        const walk = (n) => { if (!n || comp) return; const c = n.getComponent('BattleViewComp'); if (c) { comp = c; return; } n.children.forEach(walk); };
        walk(scene);
        window.__spyLog = [];
        Object.defineProperty(comp, 'selectedUnit', {
            configurable: true,
            get() { return this._su; },
            set(v) {
                window.__spyLog.push(JSON.stringify(v) + '  <-  ' + ((new Error().stack.split('\n')[2] || '').trim().slice(0, 110)));
                this._su = v;
            },
        });
    });
    await page.mouse.click(59, 160); await page.waitForTimeout(300);
    out.afterCard = await read();
    await page.mouse.click(750, 340); await page.waitForTimeout(500);
    out.afterCell = await read();
    return out;
}
