export default async function(page) {
    return await page.evaluate(() => {
        const scene = cc.director.getScene();
        let VMRef = null;
        const walk = (n) => {
            if (!n || VMRef) return;
            for (const c of n.components) {
                if (c.VM && c.VM._mvs) { VMRef = c.VM; break; }
            }
            n.children.forEach(walk);
        };
        walk(scene);
        if (!VMRef) return 'no VM found';
        const out = [];
        for (const [tag, vm] of VMRef._mvs) {
            out.push({ tag, data: JSON.parse(JSON.stringify(vm.$data)) });
        }
        return out;
    });
}
