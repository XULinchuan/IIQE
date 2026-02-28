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
        const query = options.query || {};
        const queryRef = query.ref ? String(query.ref).trim() : '';
        const sceneRaw = query.scene ? String(query.scene) : '';
        const sceneRef = sceneRaw ? extractRefFromScene(sceneRaw) : '';
        const refAgentId = queryRef || sceneRef;
        const path = String(options.path || '');
        if (refAgentId && wx.cloud && wx.cloud.callFunction) {
            wx.cloud.callFunction({
                name: 'bindReferralOnEntry',
                data: {
                    refAgentId,
                    scene: sceneRaw,
                },
            }).catch(() => {});
        }
        if (refAgentId && path && path !== 'pages/exam/home/home') {
            wx.reLaunch({
                url: `/pages/exam/home/home?ref=${encodeURIComponent(refAgentId)}`,
            });
        }
    },
});
