/**
 * 微信「微信支付提现笔笔省」每日领取辅助脚本
 * AutoJs6：定时任务入口。仅领取免费提现券，不执行任何提现或支付操作。
 *
 * 保留了原脚本在 710 x 1536 设备上已经验证成功的坐标，以及领取按钮的
 * press(x, y, 120) 兜底。所有坐标点击都只在 selector 不可用且页面状态已
 * 基本确认时执行。
 */

"auto";

var CFG = {
    scriptVersion: "2026-09-09.13",
    wechatPackage: "com.tencent.mm",
    miniProgramName: "微信支付提现笔笔省",

    launchWait: 4000,
    searchWait: 2500,
    miniProgramWait: 7000,
    claimConfirmWait: 5000,
    selectorTimeout: 1200,
    maxStepAttempts: 2,

    // 原脚本已验证的 710 x 1536 相对坐标，只作为最后兜底。
    searchXRatio: 590 / 710,
    searchYRatio: 120 / 1536,
    searchInputXRatio: 0.50,
    searchInputYRatio: 0.10,
    // 输入法复制新内容后显示的中央剪贴板候选（用户圈选的实机位置）。
    keyboardClipboardSuggestionXRatio: 0.51,
    keyboardClipboardSuggestionYRatio: 0.68,
    // 粘贴关键词后实时结果页最上方“小程序”卡片中心（实机截图）。
    miniCardXRatio: 0.50,
    miniCardYRatio: 0.215,
    // 顶部小程序卡片不存在时，下方列表的第一条选项中心。
    firstSuggestionXRatio: 0.50,
    firstSuggestionYRatio: 0.335,
    // 当前页面左侧“50 提现券”的领取按钮中心。禁止点击右侧领券活动。
    claimXRatio: 0.258,
    claimYRatio: 0.665,

    unlockConfigFile: "unlockConfig.json"
};

var STATE = {
    wechatStarted: false,
    miniProgramOpened: false,
    claimPressed: false,
    pinFallbackWarned: false,
    searchPageOpened: false,
    searchQuerySubmitted: false,
    resultOpenedByFallback: false,
    shizukuUsedForUnlock: false,
    wechatBackgroundReset: false
};

var DANGEROUS_WORDS = [
    "支付密码",
    "请输入支付密码",
    "确认支付",
    "立即支付",
    "确认提现",
    "立即提现",
    "银行卡",
    "人脸验证",
    "身份验证",
    "安全验证",
    "验证码"
];

function logInfo(msg) {
    console.log("[笔笔省] " + msg);
}

function logWarn(msg) {
    console.warn("[笔笔省] " + msg);
}

function fail(msg) {
    throw new Error(msg);
}

function errorMessage(e) {
    if (!e) return "未知错误";
    return e.message ? String(e.message) : String(e);
}

function sleepQuietly(ms) {
    sleep(ms);
}

function retryStep(name, action) {
    var lastError = null;

    for (var attempt = 1; attempt <= CFG.maxStepAttempts; attempt++) {
        try {
            logInfo(name + "（第 " + attempt + " 次）");
            if (action(attempt) !== false) return true;
            lastError = new Error(name + "未达到预期页面状态");
        } catch (e) {
            lastError = e;
        }

        if (attempt < CFG.maxStepAttempts) {
            logWarn(name + "失败，等待后仅重试一次：" + errorMessage(lastError));
            sleepQuietly(1200);
        }
    }

    fail(name + "失败：" + errorMessage(lastError));
}

function nodeText(node) {
    if (!node) return "";
    try {
        return String(node.text() || node.desc() || "");
    } catch (e) {
        return "";
    }
}

function containsDangerousWord(value) {
    var textValue = String(value || "");
    for (var i = 0; i < DANGEROUS_WORDS.length; i++) {
        if (textValue.indexOf(DANGEROUS_WORDS[i]) >= 0) return DANGEROUS_WORDS[i];
    }
    return null;
}

function guardDangerousPage() {
    for (var i = 0; i < DANGEROUS_WORDS.length; i++) {
        if (textContains(DANGEROUS_WORDS[i]).exists() ||
            descContains(DANGEROUS_WORDS[i]).exists()) {
            fail("检测到敏感页面或控件：" + DANGEROUS_WORDS[i]);
        }
    }
}

function clickableNode(node, maxParents) {
    var current = node;
    var limit = typeof maxParents === "number" ? maxParents : 4;

    for (var i = 0; current && i <= limit; i++) {
        try {
            if (current.clickable()) return current;
            current = current.parent();
        } catch (e) {
            return node;
        }
    }
    return node;
}

function safeClickNode(node, label) {
    if (!node) return false;
    var target = clickableNode(node, 4);
    var dangerous = containsDangerousWord(nodeText(node)) ||
                    containsDangerousWord(nodeText(target));
    if (dangerous) fail("拒绝点击危险控件：" + dangerous);

    try {
        if (target.clickable() && target.click()) return true;
    } catch (e) {}

    var bounds = target.bounds();
    logInfo("控件 click 不可用，点击控件中心：" + label);
    return click(bounds.centerX(), bounds.centerY());
}

function isKeyguardLocked() {
    try {
        var service = context.getSystemService(context.KEYGUARD_SERVICE);
        return service && service.isKeyguardLocked();
    } catch (e) {
        logWarn("无法读取系统锁屏状态：" + errorMessage(e));
        return true;
    }
}

function wakeScreen() {
    if (!device.isScreenOn()) {
        logInfo("唤醒屏幕");
        device.wakeUp();
        sleepQuietly(1500);
    }
    device.keepScreenOn(120000);
    if (!device.isScreenOn()) fail("屏幕唤醒失败");
}

function loadUnlockConfig() {
    var configPath = files.join(files.cwd(), CFG.unlockConfigFile);
    if (!files.exists(configPath)) return null;

    try {
        return JSON.parse(files.read(configPath));
    } catch (e) {
        fail("无法读取 unlockConfig.json：" + errorMessage(e));
    }
}

function clickPinDigitBySelector(digit) {
    var escaped = String(digit);
    var candidates = [
        id("com.android.systemui:id/key" + escaped),
        idMatches(new RegExp("(^|.*[:/])key" + escaped + "$")),
        desc(escaped),
        text(escaped)
    ];

    for (var i = 0; i < candidates.length; i++) {
        // 明确设置很短的超时，避免厂商锁屏不暴露节点时每位数字长时间等待。
        var node = candidates[i].findOne(180);
        if (node) {
            var b = node.bounds();
            if (b.centerY() > device.height * 0.35 && b.centerY() < device.height * 0.98) {
                return safeClickNode(node, "锁屏数字键 " + escaped);
            }
        }
    }
    return false;
}

function clickPinDigitByConfiguredPosition(digit, unlockConfig) {
    var fallback = unlockConfig && unlockConfig.pinKeypadFallback;
    if (!fallback || fallback.enabled !== true) return false;

    var xRatios = fallback.xRatios || [0.245, 0.49, 0.735];
    var yRatios = fallback.yRatios || [0.435, 0.545, 0.655, 0.765];
    var positions = {
        "1": [0, 0], "2": [1, 0], "3": [2, 0],
        "4": [0, 1], "5": [1, 1], "6": [2, 1],
        "7": [0, 2], "8": [1, 2], "9": [2, 2],
        "0": [1, 3]
    };
    var position = positions[String(digit)];
    if (!position || xRatios.length < 3 || yRatios.length < 4) return false;

    var x = Math.floor(device.width * Number(xRatios[position[0]]));
    var y = Math.floor(device.height * Number(yRatios[position[1]]));
    if (!STATE.pinFallbackWarned) {
        logWarn("锁屏数字 selector 不可用，本次解锁改用用户配置的键盘相对位置");
        STATE.pinFallbackWarned = true;
    }
    // 部分 ROM 的安全锁屏会让 click() 返回 false。忽略这个不可靠返回值，
    // 避免 press() 在安全锁屏窗口中长时间阻塞，最终统一检查是否已解锁。
    click(x, y);
    return true;
}

function pinCoordinate(digit, unlockConfig) {
    var fallback = unlockConfig && unlockConfig.pinKeypadFallback;
    if (!fallback || fallback.enabled !== true) return null;

    var xRatios = fallback.xRatios || [0.245, 0.49, 0.735];
    var yRatios = fallback.yRatios || [0.435, 0.545, 0.655, 0.765];
    var positions = {
        "1": [0, 0], "2": [1, 0], "3": [2, 0],
        "4": [0, 1], "5": [1, 1], "6": [2, 1],
        "7": [0, 2], "8": [1, 2], "9": [2, 2],
        "0": [1, 3]
    };
    var position = positions[String(digit)];
    if (!position || xRatios.length < 3 || yRatios.length < 4) return null;
    return [
        Math.floor(device.width * Number(xRatios[position[0]])),
        Math.floor(device.height * Number(yRatios[position[1]]))
    ];
}

function enterPinByPrivilegedTaps(pinText, unlockConfig) {
    var fallback = unlockConfig.pinKeypadFallback || {};
    var method = String(fallback.tapMethod || "shizuku").toLowerCase();
    var commands = [];

    for (var i = 0; i < pinText.length; i++) {
        var point = pinCoordinate(pinText.charAt(i), unlockConfig);
        if (!point) fail("无法计算锁屏第 " + (i + 1) + " 位数字键位置");
        commands.push("input tap " + point[0] + " " + point[1]);
        if (i < pinText.length - 1) commands.push("sleep 0.12");
    }
    var command = commands.join("; ");

    if (method === "shizuku") {
        if (typeof shizuku !== "function") {
            fail("当前 AutoJs6 不支持 Shizuku；请启用 Shizuku 权限或将 tapMethod 改为 root");
        }
        logInfo("通过 Shizuku 一次性发送 " + pinText.length + " 位 PIN 键盘点击");
        try {
            shizuku(command);
            STATE.shizukuUsedForUnlock = true;
            return true;
        } catch (e) {
            fail("Shizuku 未启动或 AutoJs6 未获授权：" + errorMessage(e));
        }
    }

    if (method === "root") {
        logInfo("通过 root 一次性发送 " + pinText.length + " 位 PIN 键盘点击");
        try {
            shell(command, true);
            return true;
        } catch (e2) {
            fail("root 坐标输入失败：" + errorMessage(e2));
        }
    }
    fail("不支持的 pinKeypadFallback.tapMethod：" + method);
}

function unlockWithPin(pin, unlockConfig) {
    var pinText = String(pin || "");
    if (!/^\d{4,16}$/.test(pinText)) {
        fail("本地 PIN 配置无效，PIN 必须为 4 到 16 位数字");
    }

    var swipeConfig = unlockConfig.unlockSwipe || {};
    var startX = Number(swipeConfig.startXRatio || 0.5);
    var startY = Number(swipeConfig.startYRatio || 0.86);
    var endX = Number(swipeConfig.endXRatio || 0.5);
    var endY = Number(swipeConfig.endYRatio || 0.20);
    var duration = Number(swipeConfig.durationMs || 500);

    logInfo("使用 Android 正常锁屏界面请求 PIN 键盘");
    swipe(
        Math.floor(device.width * startX),
        Math.floor(device.height * startY),
        Math.floor(device.width * endX),
        Math.floor(device.height * endY),
        duration
    );
    sleepQuietly(700);

    // 已确认该设备的安全锁屏会让无障碍 click/press 阻塞约两分钟。
    // 坐标模式改用一次 Shizuku/root 命令输入，仍只操作正常系统 PIN 键盘。
    var usePrivilegedCoordinates = unlockConfig.pinKeypadFallback &&
                                   unlockConfig.pinKeypadFallback.enabled === true &&
                                   unlockConfig.pinKeypadFallback.preferCoordinates === true;
    if (usePrivilegedCoordinates) {
        enterPinByPrivilegedTaps(pinText, unlockConfig);
    } else {
        // 为避免系统因错误 PIN 升级锁定，selector 模式也只输入一次。
        for (var i = 0; i < pinText.length; i++) {
            if (!clickPinDigitBySelector(pinText.charAt(i))) {
                fail("无法定位锁屏第 " + (i + 1) + " 位数字键");
            }
            sleepQuietly(180);
        }
    }

    // 最多等待 3 秒确认解锁，不重复输入 PIN。
    for (var waitIndex = 0; waitIndex < 6 && isKeyguardLocked(); waitIndex++) {
        sleepQuietly(500);
    }
    if (isKeyguardLocked()) fail("PIN 输入后仍处于锁屏状态");
    logInfo("设备已正常解锁");
    return true;
}

function ensureUnlocked() {
    if (!isKeyguardLocked()) {
        logInfo("设备当前未锁屏");
        return true;
    }

    var unlockConfig = loadUnlockConfig();
    if (!unlockConfig || unlockConfig.enabled !== true || !unlockConfig.pin) {
        fail("设备已锁屏，但未提供启用的本地 unlockConfig.json");
    }
    return unlockWithPin(unlockConfig.pin, unlockConfig);
}

function shizukuOutput(shellResult) {
    try {
        return String(shellResult && shellResult.result || "").trim();
    } catch (e) {
        return "";
    }
}

function resetWechatBackgroundIfRunning() {
    if (typeof shizuku !== "function") {
        logWarn("当前 AutoJs6 不支持 Shizuku，无法检查微信后台；继续使用原启动流程");
        return true;
    }

    var runningPids = "";
    try {
        runningPids = shizukuOutput(shizuku("pidof " + CFG.wechatPackage));
    } catch (checkError) {
        logWarn("无法通过 Shizuku 检查微信后台：" + errorMessage(checkError) + "；继续使用原启动流程");
        return true;
    }

    if (!runningPids) {
        logInfo("微信后台当前未运行，直接进入正常启动流程");
        return true;
    }

    logInfo("检测到微信后台进程，启动前彻底停止一次");
    try {
        shizuku("am force-stop " + CFG.wechatPackage);
        sleepQuietly(900);
        var remainingPids = shizukuOutput(shizuku("pidof " + CFG.wechatPackage));
        if (remainingPids) fail("微信后台进程未能彻底停止");
        STATE.wechatBackgroundReset = true;
        STATE.wechatStarted = false;
        logInfo("微信后台已清理，接下来从冷启动进入");
        return true;
    } catch (stopError) {
        fail("清理微信后台失败：" + errorMessage(stopError));
    }
}

function plusMenuOpen() {
    return text("发起群聊").exists() ||
           text("添加朋友").exists() ||
           text("扫一扫").exists() ||
           text("收付款").exists();
}

function closePlusMenuIfNeeded() {
    if (plusMenuOpen()) {
        logInfo("关闭微信加号菜单");
        back();
        sleepQuietly(700);
    }
}

function wechatVisible() {
    try {
        if (currentPackage() === CFG.wechatPackage) return true;
    } catch (e) {}
    return text("微信").exists() || descContains("微信").exists();
}

function wechatHomeVisible() {
    return text("通讯录").exists() && text("发现").exists() && text("我").exists();
}

function normalizeWechatHome() {
    // 部分微信版本不会向无障碍服务暴露底部标签。此处只能做可选归一化，
    // 不能因为识别不到标签就按返回或判定启动失败。
    if (!wechatHomeVisible()) {
        logInfo("微信底部标签不可识别，保留当前页面并继续寻找搜索入口");
        return true;
    }

    var wechatTabs = text("微信").find();
    for (var i = 0; i < wechatTabs.size(); i++) {
        var tab = wechatTabs.get(i);
        if (tab.bounds().centerY() > device.height * 0.72) {
            safeClickNode(tab, "微信首页标签");
            sleepQuietly(700);
            return true;
        }
    }
    // 已经位于微信首页，但底部标签节点可能没有暴露 clickable 属性。
    return true;
}

function launchWechat() {
    if (!app.launchPackage(CFG.wechatPackage)) return false;
    sleepQuietly(CFG.launchWait);
    guardDangerousPage();
    closePlusMenuIfNeeded();
    STATE.wechatStarted = wechatVisible();
    if (STATE.wechatStarted) normalizeWechatHome();
    return STATE.wechatStarted;
}

function findSearchButton() {
    var selectors = [
        desc("搜索"),
        descContains("搜索"),
        text("搜索")
    ];
    for (var i = 0; i < selectors.length; i++) {
        var node = selectors[i].findOne(CFG.selectorTimeout);
        if (node) return node;
    }
    return null;
}

function findSearchInput(timeout) {
    var node = className("android.widget.EditText").findOne(timeout || CFG.selectorTimeout);
    if (node) return node;
    return editable(true).findOne(timeout || CFG.selectorTimeout);
}

function openSearchPage() {
    guardDangerousPage();
    var button = findSearchButton();
    var openedByCoordinate = false;
    if (button) {
        logInfo("通过 selector 打开微信搜索");
        if (!safeClickNode(button, "微信搜索")) return false;
    } else {
        var x = Math.floor(device.width * CFG.searchXRatio);
        var y = Math.floor(device.height * CFG.searchYRatio);
        logWarn("搜索 selector 完全不可用，使用原校准相对坐标兜底");
        click(x, y);
        openedByCoordinate = true;
    }

    sleepQuietly(1400);
    if (plusMenuOpen()) {
        closePlusMenuIfNeeded();
        return false;
    }

    // 实机已确认该坐标会打开搜索页；键盘弹出后当前窗口可能变成输入法，
    // 此时 currentPackage()/wechatVisible() 都不能用于判断微信搜索页。
    if (openedByCoordinate) {
        logWarn("已按校准坐标打开搜索页，忽略输入法窗口造成的包名误判");
        STATE.searchPageOpened = true;
        return true;
    }
    if (findSearchInput(1500)) {
        STATE.searchPageOpened = true;
        return true;
    }

    // 你的微信版本使用自绘搜索框：页面和键盘已经打开，但不会暴露 EditText。
    // 已确认仍在微信且没有误开加号菜单时，允许进入聚焦输入兜底。
    if (wechatVisible()) {
        logWarn("搜索框未暴露 EditText，按已打开的自绘搜索页继续");
        STATE.searchPageOpened = true;
        return true;
    }
    return false;
}

function pasteSearchQueryFromClipboard(x, y) {
    try {
        setClip(CFG.miniProgramName);
        click(x, y);
        sleepQuietly(700);

        // setClip 后输入法显示用户圈出的“微信支付提...”剪贴板候选。
        // 点击此候选才是真正粘贴；不再依赖会误报成功的 ACTION_PASTE。
        var suggestionX = Math.floor(device.width * CFG.keyboardClipboardSuggestionXRatio);
        var suggestionY = Math.floor(device.height * CFG.keyboardClipboardSuggestionYRatio);
        logInfo("点击输入法中圈选的剪贴板候选，完成真正粘贴");
        press(suggestionX, suggestionY, 120);
        sleepQuietly(900);
        return true;
    } catch (e) {
        return false;
    }
}

function enterSearchQueryWithoutEditText() {
    if (!STATE.searchPageOpened) return false;

    var x = Math.floor(device.width * CFG.searchInputXRatio);
    var y = Math.floor(device.height * CFG.searchInputYRatio);
    if (!pasteSearchQueryFromClipboard(x, y)) {
        logWarn("自绘搜索框无法完成剪贴板粘贴");
        return false;
    }
    logInfo("已将完整小程序名称粘贴到搜索框");
    return true;
}

function enterRealSearchQuery() {
    var inputBox = findSearchInput(1800);
    if (inputBox) {
        safeClickNode(inputBox, "搜索输入框");
        sleepQuietly(300);
        // 输入框可识别时先清空；内容仍统一通过系统剪贴板粘贴。
        try {
            inputBox.setText("");
        } catch (e) {}

        var inputBounds = inputBox.bounds();
        if (!pasteSearchQueryFromClipboard(inputBounds.centerX(), inputBounds.centerY())) {
            return false;
        }
        logInfo("已清空输入框并粘贴完整小程序名称");
    } else if (!enterSearchQueryWithoutEditText()) {
        return false;
    }

    // 微信会在粘贴后实时展示最上方的小程序卡片；不要按输入法搜索键，
    // 否则会跳到网络搜索流程，偏离目标小程序入口。
    logInfo("关键词已粘贴，等待微信实时小程序结果");
    sleepQuietly(CFG.searchWait);
    STATE.searchQuerySubmitted = true;
    return true;
}

function collectionToArray(collection) {
    var result = [];
    for (var i = 0; i < collection.size(); i++) result.push(collection.get(i));
    return result;
}

function findProgramNameResultNodes() {
    var exact = collectionToArray(text(CFG.miniProgramName).find());
    var partial = collectionToArray(textContains(CFG.miniProgramName).find());
    var all = exact.concat(partial);
    var result = [];

    for (var i = 0; i < all.length; i++) {
        var node = all[i];
        var classValue = "";
        try { classValue = String(node.className() || ""); } catch (e) {}
        if (classValue.indexOf("EditText") >= 0) continue;
        if (node.bounds().centerY() < device.height * 0.12) continue;
        result.push(node);
    }
    return result;
}

function subtreeContainsText(node, expected, depth) {
    if (!node || depth < 0) return false;
    if (nodeText(node).indexOf(expected) >= 0) return true;
    try {
        for (var i = 0; i < node.childCount(); i++) {
            if (subtreeContainsText(node.child(i), expected, depth - 1)) return true;
        }
    } catch (e) {}
    return false;
}

function resultBelongsToMiniProgram(node) {
    var parent = node;
    for (var level = 0; parent && level < 5; level++) {
        if (subtreeContainsText(parent, "小程序", 4)) return true;
        try { parent = parent.parent(); } catch (e) { parent = null; }
    }

    var markers = textMatches(/^小程序$/).find();
    var resultBounds = node.bounds();
    for (var i = 0; i < markers.size(); i++) {
        var markerBounds = markers.get(i).bounds();
        var verticalGap = resultBounds.centerY() - markerBounds.centerY();
        if (verticalGap >= -80 && verticalGap < device.height * 0.45) return true;
    }
    return false;
}

function searchResultPageVisible() {
    return STATE.searchQuerySubmitted ||
           !!findSearchInput(300) ||
           text("小程序").exists() ||
           textContains("搜索结果").exists() ||
           textContains(CFG.miniProgramName).exists();
}

function realTimeSearchSuggestionsVisible() {
    return text("最常使用").exists() ||
           textContains("搜索网络结果").exists() ||
           textContains(CFG.miniProgramName).exists();
}

function miniProgramPageVisible() {
    if (!wechatVisible()) return false;
    if (alreadyClaimed()) return true;
    return textMatches(/^(领取|立即领取|免费领取)$/).exists() ||
           textContains("免费提现券").exists() ||
           textContains("提现券").exists() ||
           desc("更多").exists();
}

function openMiniProgramFromResults() {
    guardDangerousPage();
    var resultNodes = findProgramNameResultNodes();

    for (var i = 0; i < resultNodes.length; i++) {
        if (resultBelongsToMiniProgram(resultNodes[i])) {
            logInfo("已确认名称准确且属于“小程序”结果");
            if (!safeClickNode(resultNodes[i], "小程序结果")) return false;
            sleepQuietly(CFG.miniProgramWait);
            guardDangerousPage();
            STATE.miniProgramOpened = miniProgramPageVisible();
            if (!STATE.miniProgramOpened && STATE.searchQuerySubmitted) {
                logWarn("小程序页面节点不可见，按已确认的小程序卡片状态链继续领取");
                STATE.miniProgramOpened = true;
            }
            return STATE.miniProgramOpened;
        }
    }

    // 顶部卡片未能确认时，按用户指定的规则点击下方列表第一条。
    if (resultNodes.length > 0) {
        var firstLowerNode = null;
        for (var j = 0; j < resultNodes.length; j++) {
            var candidate = resultNodes[j];
            if (candidate.bounds().centerY() > device.height * 0.25 &&
                (!firstLowerNode || candidate.bounds().centerY() < firstLowerNode.bounds().centerY())) {
                firstLowerNode = candidate;
            }
        }
        if (firstLowerNode) {
            logWarn("未确认顶部小程序卡片，点击下方第一条同名选项");
            safeClickNode(firstLowerNode, "下方第一条搜索选项");
            sleepQuietly(CFG.miniProgramWait);
            guardDangerousPage();
            STATE.miniProgramOpened = miniProgramPageVisible() ||
                                      STATE.searchQuerySubmitted;
            return STATE.miniProgramOpened;
        }
    }
    if (!searchResultPageVisible()) return false;

    var x = Math.floor(device.width * CFG.miniCardXRatio);
    var y = Math.floor(device.height * CFG.miniCardYRatio);
    logWarn("结果卡片 selector 完全不可用，点击最上方小程序卡片");
    click(x, y);
    sleepQuietly(CFG.miniProgramWait);
    guardDangerousPage();
    STATE.resultOpenedByFallback = true;
    STATE.miniProgramOpened = miniProgramPageVisible();
    if (!STATE.miniProgramOpened && realTimeSearchSuggestionsVisible()) {
        var lowerX = Math.floor(device.width * CFG.firstSuggestionXRatio);
        var lowerY = Math.floor(device.height * CFG.firstSuggestionYRatio);
        logWarn("顶部小程序卡片不存在，点击下方第一条选项一次");
        click(lowerX, lowerY);
        sleepQuietly(CFG.miniProgramWait);
        guardDangerousPage();
        STATE.miniProgramOpened = miniProgramPageVisible();
    }
    if (!STATE.miniProgramOpened && STATE.searchQuerySubmitted) {
        // WebView 内容也可能完全不暴露节点。这里只接受“已真实输入准确名称 ->
        // 已触发搜索 -> 点击原来验证成功的顶部小程序卡片”这一完整状态链。
        logWarn("小程序页面节点不可见，按已验证状态链进入原领取 press 逻辑");
        STATE.miniProgramOpened = true;
    }
    return STATE.miniProgramOpened;
}

function nodeInDailyCouponArea(node) {
    if (!node) return false;
    try {
        var bounds = node.bounds();
        return bounds.centerX() < device.width * 0.52 &&
               bounds.centerY() > device.height * 0.48 &&
               bounds.centerY() < device.height * 0.82;
    } catch (e) {
        return false;
    }
}

function selectorHasNodeInDailyCouponArea(selector) {
    var nodes = selector.find();
    for (var i = 0; i < nodes.size(); i++) {
        if (nodeInDailyCouponArea(nodes.get(i))) return true;
    }
    return false;
}

function alreadyClaimed() {
    // “领取成功”可能是居中的结果提示，可直接作为成功确认。
    if (textContains("领取成功").exists() || descContains("领取成功").exists()) return true;

    // 页面还有其他活动卡片，只有左侧每日 50 提现券区域的已领取文案才有效。
    var words = ["今日已领取", "已领取", "明日再来"];
    for (var i = 0; i < words.length; i++) {
        if (selectorHasNodeInDailyCouponArea(textContains(words[i])) ||
            selectorHasNodeInDailyCouponArea(descContains(words[i]))) return true;
    }
    return false;
}

function findClaimButton() {
    var labels = [
        "领取",
        "立即领取",
        "免费领取",
        "领取免费额度",
        "领取免费提现额度",
        "领取免费提现券",
        "立即领取免费提现券"
    ];

    for (var i = 0; i < labels.length; i++) {
        var nodes = text(labels[i]).find();
        for (var j = 0; j < nodes.size(); j++) {
            var node = nodes.get(j);
            if (nodeInDailyCouponArea(node)) return node;
        }
    }
    return null;
}

function tryClaimOnce() {
    guardDangerousPage();
    if (alreadyClaimed()) {
        logInfo("今天已经领取，直接结束");
        return "already_claimed";
    }
    if (!STATE.miniProgramOpened && !miniProgramPageVisible()) {
        fail("未确认进入目标小程序，拒绝执行领取点击");
    }

    var button = findClaimButton();
    if (button) {
        var label = nodeText(button) || "领取";
        if (containsDangerousWord(label)) fail("拒绝点击危险按钮：" + label);
        logInfo("通过 selector 点击领取一次：" + label);
        if (!safeClickNode(button, label)) fail("领取按钮点击失败");
    } else {
        var x = Math.floor(device.width * CFG.claimXRatio);
        var y = Math.floor(device.height * CFG.claimYRatio);
        logWarn("领取 selector 不可用，点击左侧每日 50 提现券按钮一次");
        console.log("[笔笔省] claim = " + x + "," + y);
        // 保留当前项目已经成功跑通的领取动作，不重试、不连点。
        press(x, y, 120);
    }

    STATE.claimPressed = true;
    sleepQuietly(CFG.claimConfirmWait);
    guardDangerousPage();
    if (alreadyClaimed()) {
        logInfo("已确认领取完成");
        return "claimed";
    }
    logWarn("领取已点击一次，但页面未暴露可识别的成功文案；不会再次点击");
    return "pressed_once";
}

function sendResultNotification(result, failureMessage) {
    if (typeof notice !== "function") {
        logWarn("当前 AutoJs6 不支持 notice 通知模块");
        return false;
    }

    var title = "微信提现券任务";
    var content = "";
    if (result === "claimed") {
        title = "微信提现券：领取成功";
        content = "页面已经确认今日提现券领取完成。";
    } else if (result === "already_claimed") {
        title = "微信提现券：今日已领取";
        content = "检测到今日已领取，本次没有重复点击。";
    } else if (result === "pressed_once") {
        title = "微信提现券：请检查结果";
        content = "已点击左侧每日提现券一次，但页面未返回可识别的成功文案。";
    } else {
        title = "微信提现券：运行失败";
        content = failureMessage || "脚本未能完成领取，请查看 AutoJs6 日志。";
    }

    try {
        if (typeof notice.isEnabled === "function" && !notice.isEnabled()) {
            logWarn("AutoJs6 通知权限未开启，无法发送结果通知");
            return false;
        }
        notice(title, content, { isSilent: true, autoCancel: true });
        logInfo("已发送任务结果通知：" + title);
        return true;
    } catch (noticeError) {
        logWarn("发送任务结果通知失败：" + errorMessage(noticeError));
        return false;
    }
}

function leaveWechat() {
    if (!STATE.wechatStarted) return;
    logInfo("返回并退出微信到桌面");
    try { back(); } catch (e) {}
    sleepQuietly(500);
    try { back(); } catch (e2) {}
    sleepQuietly(500);
    try { home(); } catch (e3) {}
    sleepQuietly(700);
}

function turnScreenOff() {
    try { device.cancelKeepingAwake(); } catch (e) {}
    if (!device.isScreenOn()) return true;

    if (STATE.shizukuUsedForUnlock && typeof shizuku === "function") {
        try {
            shizuku("input keyevent 26");
            sleepQuietly(600);
            if (!device.isScreenOn()) {
                logInfo("已通过 Shizuku 熄灭屏幕");
                return true;
            }
        } catch (shizukuError) {
            logWarn("Shizuku 熄屏失败：" + errorMessage(shizukuError));
        }
    }

    // Android 9(API 28)+ 提供无障碍全局锁屏动作，无需模拟资金相关界面。
    try {
        if (android.os.Build.VERSION.SDK_INT >= 28 && auto.service) {
            var action = android.accessibilityservice.AccessibilityService.GLOBAL_ACTION_LOCK_SCREEN;
            if (auto.service.performGlobalAction(action)) {
                sleepQuietly(900);
                if (!device.isScreenOn()) {
                    logInfo("屏幕已熄灭");
                    return true;
                }
            }
        }
    } catch (e2) {
        logWarn("无障碍熄屏失败：" + errorMessage(e2));
    }

    logWarn("无法自动熄屏；请确认 Android 9+ 且 AutoJs6 无障碍服务允许锁屏");
    return false;
}

function main() {
    if (!auto.service) fail("AutoJs6 无障碍服务未启用");
    logInfo("脚本版本：" + CFG.scriptVersion);
    wakeScreen();
    ensureUnlocked();
    resetWechatBackgroundIfRunning();

    retryStep("启动微信", launchWechat);
    retryStep("打开微信搜索页", openSearchPage);
    retryStep("输入并执行真实搜索", enterRealSearchQuery);
    retryStep("打开准确的小程序结果", openMiniProgramFromResults);
    return tryClaimOnce();
}

var finalResult = "failed";
var finalErrorMessage = "";
try {
    finalResult = main();
    logInfo("任务结束：" + finalResult);
} catch (e) {
    finalErrorMessage = errorMessage(e);
    console.error("[笔笔省] 安全退出：" + finalErrorMessage);
} finally {
    sendResultNotification(finalResult, finalErrorMessage);
    leaveWechat();
    turnScreenOff();
}
