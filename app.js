function extractRefFromScene(scene) {
    const decoded = decodeURIComponent(scene || '');
    if (!decoded) return '';
    const parts = decoded.split('&');
    for (const p of parts) {
        const arr = p.split('=');
        if (arr[0] === 'ref' && arr[1]) return arr[1];
    }
    return '';
}

App({
    onLaunch() {
        if (wx.cloud) {
            wx.cloud.init({
                traceUser: true,
            });
        }
    },
    onShow(options = {}) {
        const queryRef = options.query && options.query.ref ? String(options.query.ref).trim() : '';
        const sceneRef = options.scene ? extractRefFromScene(options.scene) : '';
        const refAgentId = queryRef || sceneRef;
        if (refAgentId && wx.cloud && wx.cloud.callFunction) {
            wx.cloud.callFunction({
                name: 'bindReferralOnEntry',
                data: {
                    refAgentId,
                    scene: options.scene || '',
                },
            }).catch(() => {});
        }
    },
});
