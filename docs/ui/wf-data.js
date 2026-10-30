// Layout data shared by docs/ui/wireframes.html (3 concepts) and docs/ui/final/wireframe-final.html (the chosen one):
// INV (the closed list of elements per screen), the SVG drawing, the Home of the reference image and L[screen](concept).
// Coordinates are design units of the 1280x720 canvas.
// ---------------------------------------------------------------- inventory: the closed list of every screen
// id: [element, original object, text verbatim / icon]
const INV = {
  '02': ['Transition', {
    'tr.bg': ['Nền đen phủ màn', 'Transition Screen/Background', '—'],
    'tr.world': ['Ô world (lục giác)', 'WorldTransitionIndicator', '"World" + số, icon world'],
    'tr.navL': ['Mũi tên world trái', 'WorldNav/Left', 'icon «'],
    'tr.navR': ['Mũi tên world phải', 'WorldNav/Right', 'icon »'],
    'tr.lock': ['Yêu cầu sao (world khoá)', 'LockedFade/Star Requirement Indicator - Large', 'icon ★ + số'],
    'tr.soon': ['Sắp ra mắt', 'LockedFade/ComingSoon', 'Coming Soon'],
  }],
  '03': ['Home', {
    'h.scene': ['Nền núi neon', 'cảnh 3D menu (mới)', 'art', 'req'],
    'h.podium': ['Bệ đỡ xe', 'cảnh 3D menu (mới)', 'art', 'req'],
    'h.vehicle': ['Xe 3D', 'Menu Cam / xe đang chọn', '—'],
    'h.gem': ['Thanh gem', 'TopBar/Right/SoftCurencyBar', 'icon gem + số'],
    'h.ruby': ['Thanh ruby', 'TopBar/Right/HardCurrencyBar', 'icon ruby + số'],
    'h.navL': ['Mũi tên world trái', 'Home Screen/WorldNav/Left', 'icon «'],
    'h.world': ['Ô WORLD n (mở World Stats)', 'TopContainer/WorldStatsButton', '"World" + số'],
    'h.navR': ['Mũi tên world phải', 'Home Screen/WorldNav/Right', 'icon »'],
    'h.hsLabel': ['Chữ High Score', 'ScoreDisplay/High Score Text', 'High Score'],
    'h.hsNum': ['Điểm cao nhất', 'ScoreDisplay/High Score Number', 'số'],
    'h.hsNew': ['Nhãn kỷ lục mới', 'ScoreDisplay/NewSticker', 'lục giác'],
    'h.lb': ['Nút Leaderboard', 'LeaderboardButton (src/portal.js)', 'icon vương miện'],
    'h.rank': ['Sao rank', 'StarRankBar-OpenRewardTrack/Icon', 'icon sao + số rank'],
    'h.starbar': ['Thanh sao (mở Reward Track)', 'StarRankBar-OpenRewardTrack/FillbarBackground', '"0/888" + ★'],
    'h.bonus': ['Nút BONUS (chữ B-O-N-U-S)', 'BottomContainer/ClaimBonusButton', 'BONUS (pip)'],
    'h.settings': ['Nút Settings', 'TopContainer/SettingsButton', 'icon bánh răng'],
    't.shop': ['Tab Shop', 'Bottom Menu Button - Store', 'icon giỏ + Shop'],
    't.veh': ['Tab Garage', 'Bottom Menu Button - Meta', 'icon xe + Vehicles', 'req'],
    't.world': ['Tab World = Play', 'Bottom Menu Button - Endless + PlayButton', 'icon world + World', 'req'],
    't.chal': ['Tab Challenges', 'BottomContainer/ChallengeButton', 'icon cúp + Challenges'],
    't.lvl': ['Tab Levels', 'BottomContainer/LevelsButton', 'icon cột + Levels'],
    'b.shop': ['Badge Shop', 'Store/GameNotificationWithText', 'số'],
    'b.veh': ['Badge Garage', 'Meta/GameNotificationWithText', 'số'],
    'b.chal': ['Badge Challenges', 'ChallengeButton/GameNotificationWithText', 'số'],
    'b.lvl': ['Badge Levels', 'LevelsButton/GameNotificationWithText', '!'],
    'h.tooltip': ['Tooltip mở khoá', 'Tooltip Popup', 'Needs Star Rank {[0]} to unlock'],
    'h.chpop': ['Popup challenge xong', 'BottomContainer/ChallengePopUps', 'chữ challenge'],
  }],
  '04': ['Challenges', {
    'c.title': ['Tiêu đề', 'ChallengeOverlay/ChallengesText', 'World {n} Challenges'],
    'c.done': ['Số đã xong', 'CompletedText', 'Completed x/50'],
    'c.text': ['Mô tả challenge', 'ChallengeDisplay/ChallengeText', 'chữ challenge'],
    'c.fill': ['Thanh tiến độ', 'ChallengeDisplay/FillBarMask', '—'],
    'c.reward': ['Phần thưởng', 'ChallengeDisplay/RewardContainer', 'icon + số'],
    'c.hard': ['Icon challenge khó', 'HardChallenge Icon', 'icon'],
    'c.check': ['Dấu xong', 'ChallengeCompleted/Checkmark', 'icon ✓'],
    'c.skip': ['Nút bỏ challenge', 'SkipChallengeButton', 'icon skip'],
    'c.reset': ['Nút bỏ thời gian chờ', 'ResetTimerButton', 'icon skip timer'],
    'c.timed': ['Ô đang chờ', 'Completed Timed State', 'Next Challenge in + giờ'],
    'c.locked': ['Ô khoá', 'Locked State', 'Needs {n} stars to unlock + khoá'],
    'c.allDone': ['Đã xong hết', 'Completed World State', "You've completed all World Challenges!"],
    'c.close': ['Nút đóng', 'ChallengeOverlay/CloseButton', 'X'],
  }],
  '04b': ['Challenges — popup bỏ qua', {
    'cr.title': ['Tiêu đề', 'ChallengeResetPopup/Header', 'Timed Challenge ????'],
    'cr.info': ['Câu hỏi', 'info', 'Are you sure?'],
    'cr.ad': ['Nút quảng cáo', 'AdButton', 'icon quảng cáo + giờ'],
    'cr.ruby': ['Nút ruby', 'HardCurrencyButton', 'icon ruby + giá'],
    'cr.close': ['Nút đóng', 'X Button', 'icon ✕'],
  }],
  '05': ['Levels', {
    'l.bg': ['Nền world', 'Background/World Background Image', 'ảnh'],
    'l.title': ['Tên trang độ khó', 'Levels - Easy/Top Banner', 'Easy Levels / Moderate / Difficult'],
    'l.item': ['8 ô level', 'Level - List Element', 'tên, thời gian tốt nhất, sao'],
    'l.arrowL': ['Mũi tên trang trước', 'ArrowLeft', 'icon «'],
    'l.arrowR': ['Mũi tên trang sau', 'ArrowRight', 'icon »'],
    'l.badge': ['Badge trang mới', 'ArrowRight/GameNotification', '!'],
    'l.total': ['Tổng sao', 'TotalStarsBar', 'Total + ★88'],
    'l.locked': ['Trang khoá', 'LockedFade/Star Requirement Indicator - Large', 'icon ★ + số'],
    'l.close': ['Nút đóng', 'Timed Level Close/CloseButton', 'icon ✕'],
  }],
  '06': ['World Stats', {
    's.bg': ['Nền world', 'Background/World Background Image', 'ảnh'],
    's.title': ['Tiêu đề', 'World Banner/ProgressText', 'Progress'],
    's.fill': ['Thanh % world', 'Fill Bar - Background', '88%'],
    's.endless': ['Nhóm Endless', 'Statistics - Endless', 'Endless: World Challenges, High Score'],
    's.levels': ['Nhóm Levels', 'Statistics - Levels', 'Levels: Easy, Moderate, Difficult'],
    's.coll': ['Nhóm Collection', 'Statistics - Collection', 'Collection'],
    's.close': ['Nút đóng', 'Statistics Page Close/CloseButton', 'icon ✕'],
  }],
  '07': ['Reward Track', {
    'r.title': ['Tiêu đề', 'RewardTrack/TopBar/Text', 'Star rank'],
    'r.rank': ['Sao rank hiện tại', 'StarCurrencyBar/Icon', 'icon sao + số'],
    'r.fill': ['Thanh sao', 'StarCurrencyBar/FillbarBackground', 'x / y ★'],
    'r.next': ['Sao rank kế', 'StarCurrencyBar/Icon - Next Level', 'icon sao + số'],
    'r.entry': ['Các bậc rank', 'UI_RewardTrackEntry', 'sao rank, phần thưởng, Next Reward, tên, mô tả'],
    'r.lock': ['Khoá bậc', 'Entry/Lock', 'icon khoá'],
    'r.claimed': ['Đã nhận', 'Entry/ClaimedOverlay', 'Claimed + ✓'],
    'r.close': ['Nút đóng', 'Overlay/CloseButton', 'icon ✕'],
  }],
  '08': ['Garage', {
    'g.name': ['Tên card', 'CardNameBar/CardName', 'tên'],
    'g.rarity': ['Độ hiếm', 'CardName/CardRarity', 'Common / Legendary…'],
    'g.amount': ['Số bản sao', 'LevelFillbar', '88/88'],
    'g.preview': ['Xe 3D xem trước', 'VehiclePreviewCam', '—'],
    'g.skins': ['4 ô rank / skin', 'Ranks/Tiers', 'Preview'],
    'g.plock': ['Khoá xem trước', 'Ranks/PreviewContainer', 'icon khoá'],
    'g.tabs': ['5 tab loại card', 'TabButtons', 'icon: Vehicles, Colors, Trail Effects, Landing Effects, Death Effects'],
    'g.tbadge': ['Badge tab', 'TabButton/GameNotification', '!'],
    'g.world': ['Tiêu đề nhóm world', 'UI_MetaDividerBanner', 'World 1 / 2 / 3'],
    'g.card': ['Card', 'UI_MetaCard', 'icon, tên, 0 / 2, !'],
    'g.clock': ['Card khoá', 'UI_MetaCard (locked)', 'Unlocks in World n'],
  }],
  '09': ['Shop', {
    'sp.bg': ['Nền shop', 'Shop Screen/Background', 'ảnh'],
    'sp.freeH': ['Mục Free Rewards', 'RVTrackShopSection/Header', 'Free Rewards + giờ làm mới'],
    'sp.freeTxt': ['Giải thích', 'RV_Track/Explanation', 'Watch {n} Rewarded Videos'],
    'sp.ad': ['Nút xem quảng cáo', 'RV_Track_AdButton', 'icon quảng cáo'],
    'sp.freeBar': ['4 đoạn tiến độ', 'RV_Track_Fillbar_1..4', '—'],
    'sp.freeItem': ['5 phần thưởng', 'RV_Track_Reward_*', 'icon + số, ✓'],
    'sp.chestH': ['Mục Chests', 'LootboxShopSection/Header', 'Chests'],
    'sp.chest': ['Rương nhỏ', 'LootboxShopItem', 'Small, ảnh rương, giá / Free, next free in:'],
    'sp.chestL': ['Rương lớn', 'LootboxShopItemLarge', 'Large, ảnh rương, giá, Most popular!'],
    'sp.dealH': ['Mục Daily Deals', 'DailyDealsShopSection/Header', 'Daily Deals + giờ'],
    'sp.deal': ['Card bán trong ngày', 'DailyDealsShopItem', 'card, tên, độ hiếm, x số, giá'],
    'sp.refresh': ['Nút làm mới deal', 'DailyDealsShopSection/RefreshButton', 'icon làm mới'],
    'sp.rubyH': ['Mục Rubies', 'HardCurrencyShopSection/Header', 'Rubies'],
    'sp.gift': ['Quà ruby (quảng cáo)', 'HardCurrencyShopGiftItem', 'Get Rubies! / Come back later for more gifts'],
    'sp.rubyItem': ['Gói ruby nạp tiền', 'HardCurrencyShopItem', 'ảnh ruby, tên, Not Available'],
  }],
  '09b': ['Shop — popup xác nhận', {
    'sc.title': ['Tên món', 'ShopConfirmation/Title', 'chest / tên card'],
    'sc.rarity': ['Độ hiếm', 'Rarity', 'common…'],
    'sc.info': ['Nội dung rương', 'Info Container', 'Contains: + số card'],
    'sc.icon': ['Ảnh món', 'Item icon / UI_MetaCard', 'ảnh'],
    'sc.buy': ['Nút mua', 'BuyButton', 'giá + icon tiền'],
    'sc.close': ['Nút đóng', 'CloseButton', 'icon ✕'],
    'sr.title': ['Popup làm mới deal', 'DailyDealShopRefreshPopUp/Header', 'Daily deals refresh'],
    'sr.count': ['Số lần', 'RefreshCount', 'x/3'],
    'sr.info': ['Câu hỏi', 'info', 'Are you sure?'],
    'sr.ad': ['Nút quảng cáo', 'Answers/AdButton', 'icon quảng cáo'],
  }],
  '10': ['Settings', {
    'st.title': ['Tiêu đề', 'PausePopup/Header', 'Settings'],
    'st.music': ['Bật/tắt nhạc', 'MusicToggle', 'icon nốt nhạc'],
    'st.sfx': ['Bật/tắt âm thanh', 'SfxToggle', 'icon loa'],
    'st.bloom': ['Bật/tắt bloom', 'BloomToggle', 'icon bloom'],
    'st.cpr': ['Version + copyright', 'PausePopup/cpr', 'V&lt;version&gt; + dòng copyright'],
    'st.close': ['Nút đóng', 'CloseButton', 'icon ✕'],
  }],
  '11': ['Leaderboard', {
    'lb.title': ['Tiêu đề', 'ui.js head', 'Leaderboard'],
    'lb.close': ['Nút đóng', 'gmlb-x', 'icon ✕'],
    'lb.tabs': ['4 tab thời gian', 'gmlb-tabs', 'Today, This week, This month, All time'],
    'lb.row': ['Dòng hạng', 'gmlb-row', 'hạng, cờ, tên, điểm'],
    'lb.more': ['Tải thêm', 'gmlb-list button', 'More'],
    'lb.note': ['Thông báo', 'gmlb-note', 'Loading… / Could not load the leaderboard. + Try again / No scores yet. Be the first!'],
    'lb.me': ['Dòng của tôi', 'gmlb-foot', 'hạng, cờ, tên, điểm / No score yet'],
    'lb.edit': ['Sửa tên & cờ', 'gmlb-actions', 'Name & flag'],
  }],
  '11b': ['Leaderboard — Name & flag', {
    'lf.title': ['Tiêu đề', 'head', 'Name & flag'],
    'lf.name': ['Ô tên', 'gmlb-form label', 'Name + Up to 20 letters, numbers, _ or -'],
    'lf.flag': ['Chọn cờ', 'gmlb-pick', 'Flag'],
    'lf.err': ['Lỗi', 'gmlb-error', 'Could not save. Check the name and try again.'],
    'lf.cancel': ['Huỷ', 'button', 'Cancel'],
    'lf.save': ['Lưu', 'button', 'Save'],
    'lf.close': ['Nút đóng', 'gmlb-x', 'icon ✕'],
  }],
  '12': ['Rank Up', {
    'ru.bg': ['Nền', 'Container/Background', 'ảnh lục giác'],
    'ru.title': ['Tiêu đề', 'RankBox/RankUp', 'Rank Up!'],
    'ru.star': ['Sao rank lớn', 'LevelBaseStar', 'số rank'],
    'ru.reward': ['Phần thưởng rank', 'RewardBox (RankUpReward_*)', 'card / gem / ruby / mở level, world'],
    'ru.rv': ['Nút nhân đôi (quảng cáo)', 'DoubleReward RV/Button', 'icon quảng cáo'],
    'ru.tap': ['Gợi ý chạm', 'TapToContinue', 'Tap to continue'],
  }],
  '13': ['Claim Bonus', {
    'cb.title': ['Tiêu đề', 'ClaimTitleText', 'Claim Bonus Reward'],
    'cb.icon': ['Ảnh gem', 'GemsIcons', 'ảnh'],
    'cb.amount': ['Số gem', 'GemsText', '+400 Gems'],
    'cb.claim': ['Nút nhận', 'ClaimButton', 'Claim'],
    'cb.rv': ['Nút x2 (quảng cáo)', 'RVButton', 'icon quảng cáo + x2 Gems'],
  }],
  '14': ['Lootbox — mở rương', {
    'lx.bg': ['Nền', 'LootboxOpenAnimation/Background', 'ảnh lục giác'],
    'lx.chest': ['Rương 3D', 'RenderTextureLootbox', 'rương + số card'],
    'lx.tap': ['Gợi ý chạm', 'LootboxVisuals', 'Tap to Open'],
    'lx.left': ['Số card còn lại', 'CardsLeft', 'số'],
  }],
  '14b': ['Lootbox — lật card / tổng kết', {
    'lx.card': ['Card vừa lật', 'CardBase', 'ảnh, tên, loại, 88/88, +1, Upgraded!, Quality Increased, Bonus Reward'],
    'lx.overview': ['Lưới tổng kết', 'LootboxCollectionOverview/CollectionGrid', 'các card'],
    'lx.claim': ['Nút nhận', 'BottomButtons/ClaimButton', 'Claim'],
    'lx.lose': ['Bỏ card thêm', 'BottomButtons_LootboxRV/LoseButton', 'Lose it'],
    'lx.rv': ['Lấy card thêm (quảng cáo)', 'BottomButtons_LootboxRV/RVButton', 'icon quảng cáo'],
  }],
  '15': ['HUD', {
    'hd.gem': ['Gem trong lượt', 'HUD TopContainer/SoftCurencyBar', 'icon gem + số'],
    'hd.score': ['Điểm', 'Score Display - Gameplay', 'số'],
    'hd.best': ['Nhãn kỷ lục', 'Score Display (new best)', 'New Best!'],
    'hd.timer': ['Đồng hồ level', 'Level Timer', 'giờ (Level)'],
    'hd.name': ['Tên level', 'TimedLevelNameDisplay', 'Easy 1… (Level)'],
    'hd.bonus': ['Chữ B-O-N-U-S', 'BonusLetterBar', 'B O N U S'],
    'hd.restart': ['Chơi lại (Level)', 'RestartButton', 'icon ↻'],
    'hd.pause': ['Tạm dừng', 'PauseButton', 'icon ⏸'],
    'hd.compliment': ['Lời khen', 'Compliment Spawn', 'Double Flip!, Perfect…'],
    'hd.jump': ['Điểm cú nhảy', 'Jump Score Text Origin', '+n'],
    'hd.chpop': ['Popup challenge trong lượt', 'ChallengePopupContainer', 'icon world, chữ, thanh tiến độ'],
    'hd.marker': ['Mốc trên đường', 'PositionalMarker', 'HIGHSCORE / PREVIOUS / DAILY AVERAGE'],
  }],
  '16': ['Pause', {
    'p.title': ['Tiêu đề', 'PausePopup/Header', 'Paused'],
    'p.home': ['Về Home', 'MenuButton', 'icon thoát'],
    'p.music': ['Bật/tắt nhạc', 'MusicToggle', 'icon nốt nhạc'],
    'p.sfx': ['Bật/tắt âm thanh', 'SfxToggle', 'icon loa'],
    'p.bloom': ['Bật/tắt bloom', 'BloomToggle', 'icon bloom'],
    'p.resume': ['Chơi tiếp', 'ResumeButton', 'Resume'],
    'p.ch': ['3 challenge đang chạy', 'ChallengesContainer (ReadOnly)', 'chữ, thanh tiến độ, phần thưởng'],
  }],
  '17': ['Tutorial', {
    'tu.text': ['Chữ hướng dẫn', 'TutorialText/Text', 'Hold to Accelerate!…'],
    'tu.tap': ['Gợi ý chạm', 'TutorialText/TapToContinue', 'Tap to Continue'],
    'tu.hand': ['Bàn tay', 'TutorialHand Press / Moving', 'ảnh tay'],
    'tu.focus': ['Vùng sáng', 'TutorialFocus', 'tròn / chữ nhật'],
    'tu.image': ['Ảnh minh hoạ', 'TutorialImage', 'ảnh'],
    'tu.block': ['Chặn bấm', 'InteractionBlocker', '—'],
  }],
  '18': ['Revive', {
    'rv.title': ['Tiêu đề', 'Revive Test (TMP)', 'Revive?'],
    'rv.timer': ['Đếm ngược', 'Revive Timer', 'trái tim + số giây'],
    'rv.ad': ['Hồi sinh bằng quảng cáo', 'Ad Button', 'icon quảng cáo + Continue'],
    'rv.ruby': ['Hồi sinh bằng ruby', 'HardCurrency Button', 'icon ruby + giá'],
    'rv.skip': ['Bỏ qua', 'Skip Button', 'icon ✕'],
    'rv.trigger': ['Lý do hồi sinh', 'TriggerBox', 'Almost new high score! + 88 / 88 · Challenge almost complete! · Bonus letter nearby!'],
    'rv.rubybar': ['Thanh ruby', 'HardCurrencyBar', 'icon ruby + số'],
  }],
};

// ---------------------------------------------------------------- drawing
const E = (id, s, x, y, w, h, t = '', o = {}) => ({ id, s, x, y, w, h, t, ...o });
const COL = { n: ['#1a0b45', '#b03cff'], a: ['#3a1170', '#ff5ce1'], b: ['#0b1d4a', '#3c8bff'], g: ['#0f3a24', '#3cff8f'], y: ['#3b2a00', '#ffcc00'], r: ['#e8202a', '#ff6b6b'], k: ['#0c0a1e', '#4a3c80'] };
const pts = (a) => a.map((p) => p.map((v) => +v.toFixed(1)).join(',')).join(' ');
function shapePts(s, x, y, w, h) {
  if (s === 'hex') return [[x + w * 0.22, y], [x + w * 0.78, y], [x + w, y + h / 2], [x + w * 0.78, y + h], [x + w * 0.22, y + h], [x, y + h / 2]];
  if (s === 'pill') { const k = Math.min(h * 0.5, w / 4); return [[x + k, y], [x + w - k, y], [x + w, y + h / 2], [x + w - k, y + h], [x + k, y + h], [x, y + h / 2]]; }
  if (s === 'star') {
    const cx = x + w / 2, cy = y + h * 0.54, R = Math.min(w, h) / 2, r = R * 0.45, out = [];
    for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? r : R; out.push([cx + rr * Math.cos(a), cy + rr * Math.sin(a)]); }
    return out;
  }
  const c = Math.min(16, h / 3, w / 3); // 'cham', 'tab', 'btn', 'row'
  return [[x + c, y], [x + w - c, y], [x + w, y + c], [x + w, y + h - c], [x + w - c, y + h], [x + c, y + h], [x, y + h - c], [x, y + c]];
}
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
/** design font size of an element; the final layout raises readable text to MIN_FS (notes of states / 3D stand-ins excluded) */
function fontSize(e) {
  const lines = String(e.t).split('\n').length;
  const fs = e.fs || Math.max(10, Math.min(22, (e.h / lines) * 0.5));
  return e.note ? fs : Math.max(globalThis.MIN_FS || 0, fs);
}
function textEl(e, color) {
  const lines = String(e.t).split('\n');
  const fs = fontSize(e);
  const anchor = e.al === 'l' ? 'start' : e.al === 'r' ? 'end' : 'middle';
  const tx = e.al === 'l' ? e.x + 12 : e.al === 'r' ? e.x + e.w - 12 : e.x + e.w / 2;
  const y0 = e.y + e.h / 2 - ((lines.length - 1) * fs * 1.15) / 2 + fs * 0.36;
  const weight = e.thin ? 400 : 700;
  return `<text x="${tx}" y="${y0}" font-size="${fs}" fill="${color}" text-anchor="${anchor}" font-weight="${weight}" font-family="Segoe UI, Arial, sans-serif">${lines.map((l, i) => `<tspan x="${tx}" dy="${i ? fs * 1.15 : 0}">${esc(l)}</tspan>`).join('')}</text>`;
}
function draw(e) {
  const [fill, stroke] = COL[e.c] || COL.n;
  let g = '';
  if (e.s === 'scene') {
    g += `<rect width="1280" height="720" fill="url(#sky)"/><polygon points="0,430 140,250 260,360 380,210 520,380 640,300 760,380 900,200 1030,350 1150,240 1280,330 1280,520 0,520" fill="#2a1475" opacity=".85"/><polygon points="0,520 1280,520 1280,720 0,720" fill="#12063a"/>`;
    if (e.t && e.id) g += `<text x="14" y="${e.lbY || 160}" font-size="12" fill="#8f91c0" font-style="italic">${esc(e.t)}</text>`;
    return g;
  }
  if (e.s === 'dim') return `<rect width="1280" height="720" fill="${e.black ? '#000' : '#05030f'}" opacity="${e.op ?? 0.6}"/>`;
  if (e.s === 'black') return `<rect x="${e.x}" y="${e.y}" width="${e.w}" height="${e.h}" fill="#000"/>`;
  if (e.s === 'text') return textEl(e, e.color || (e.c === 'y' ? '#ffcc00' : e.c === 'm' ? '#ff4fd8' : '#ffffff'));
  if (e.s === 'ghost' || e.s === 'state') {
    const col = e.s === 'ghost' ? '#7d7fb0' : '#f5b000';
    g += `<rect x="${e.x}" y="${e.y}" width="${e.w}" height="${e.h}" rx="6" fill="${e.s === 'ghost' ? 'rgba(125,127,176,.06)' : 'rgba(245,176,0,.07)'}" stroke="${col}" stroke-dasharray="7 5" stroke-width="2"/>`;
    return g + textEl({ ...e, thin: true, note: true, fs: e.fs || Math.min(15, e.h * 0.32) }, col);
  }
  if (e.s === 'badge') return `<circle cx="${e.x + e.w / 2}" cy="${e.y + e.h / 2}" r="${e.w / 2}" fill="#e8202a" stroke="#fff" stroke-width="2"/>` + textEl({ ...e, fs: e.w * 0.55 }, '#fff');
  if (e.s === 'fill') {
    const p = e.p ?? 0.4;
    return `<polygon points="${pts(shapePts('pill', e.x, e.y, e.w, e.h))}" fill="#120830" stroke="${stroke}" stroke-width="2"/><polygon points="${pts(shapePts('pill', e.x + 2, e.y + 2, Math.max(e.h, (e.w - 4) * p), e.h - 4))}" fill="${stroke}" opacity=".85"/>` + (e.t ? textEl({ ...e, fs: e.fs || e.h * 0.6 }, '#fff') : '');
  }
  if (e.s === 'rect') g += `<rect x="${e.x}" y="${e.y}" width="${e.w}" height="${e.h}" rx="4" fill="${fill}" stroke="${stroke}" stroke-width="2"/>`;
  else g += `<polygon points="${pts(shapePts(e.s, e.x, e.y, e.w, e.h))}" fill="${fill}" fill-opacity="${e.s === 'cham' && !e.c ? 0.93 : 1}" stroke="${stroke}" stroke-width="${e.c === 'a' ? 3 : 2}"${e.c === 'a' ? ' filter="url(#glow)"' : ''}/>`;
  if (e.lead) g += `<text x="${e.x + e.h * 0.95}" y="${e.y + e.h * 0.72}" font-size="${e.h * 0.62}" fill="${e.lead === '◆' ? '#4fd8ff' : '#ff3b4f'}" text-anchor="middle">${e.lead}</text>`;
  if (e.t) g += textEl(e, e.c === 'y' ? '#ffcc00' : '#ffffff');
  return g;
}
const DEFS = `<defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0a0630"/><stop offset=".6" stop-color="#2a0f6e"/><stop offset="1" stop-color="#12063a"/></linearGradient><filter id="glow" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>`;
const svg = (els) => `<svg viewBox="0 0 1280 720" xmlns="http://www.w3.org/2000/svg">${DEFS}<rect width="1280" height="720" fill="#090418"/>${els.map(draw).join('')}</svg>`;

// ---------------------------------------------------------------- shared parts: the Home of the reference image
const HOME_TOP = (world = true) => [
  E('h.gem', 'pill', 32, 27, 247, 33, '397', { lead: '◆' }),
  E('h.ruby', 'pill', 32, 67, 247, 34, '75', { lead: '⬢' }),
  ...(world ? [E('h.navL', 'hex', 458, 32, 70, 54, '«', { fs: 30 }), E('h.world', 'hex', 540, 11, 199, 105, 'WORLD\n1', { c: 'a', fs: 26 }), E('h.navR', 'hex', 753, 32, 70, 54, '»', { fs: 30 })] : []),
  E('h.rank', 'star', 929, 17, 62, 60, '8', { fs: 18 }),
  E('h.starbar', 'fill', 975, 36, 200, 31, '1/5 ★', { p: 0.3 }),
  E('h.bonus', 'text', 1004, 72, 124, 26, 'BONUS', { c: 'y', fs: 22 }),
  E('h.settings', 'hex', 1188, 21, 69, 64, '⚙', { fs: 30 }),
];
const TABS = (active) => [
  E('t.shop', 'cham', 27, 591, 245, 94, '🛒\nSHOP', { c: active === 'shop' ? 'a' : 'n', fs: 20 }),
  E('t.veh', 'cham', 260, 591, 268, 94, '🏍\nVEHICLES', { c: active === 'veh' ? 'a' : 'n', fs: 20 }),
  E('t.world', 'cham', 514, 586, 255, 100, '🌐 ▶\nWORLD', { c: active === 'world' ? 'a' : 'n', fs: 20 }),
  E('t.chal', 'cham', 758, 591, 268, 94, '🏆\nCHALLENGES', { c: active === 'chal' ? 'a' : 'n', fs: 20 }),
  E('t.lvl', 'cham', 1014, 591, 242, 94, '📊\nLEVELS', { c: active === 'lvl' ? 'a' : 'n', fs: 20 }),
  E('b.shop', 'badge', 236, 578, 30, 30, '3'),
  E('b.veh', 'badge', 494, 578, 30, 30, '9'),
  E('b.chal', 'badge', 985, 578, 30, 30, '3'),
  E('b.lvl', 'badge', 1222, 578, 30, 30, '!'),
];
const HOME = () => [
  E('h.scene', 'scene', 0, 0, 1280, 720, 'Nền núi neon (art mới)', { lbY: 200 }),
  E('h.podium', 'ghost', 314, 400, 658, 136, 'Bệ đỡ xe (art mới)'),
  E('h.vehicle', 'ghost', 505, 286, 290, 160, 'Xe 3D'),
  ...HOME_TOP(true),
  E('h.hsLabel', 'text', 530, 128, 220, 32, 'High Score', { c: 'm', fs: 28 }),
  E('h.hsNum', 'text', 580, 160, 120, 40, '60', { fs: 34 }),
  E('h.hsNew', 'hex', 700, 166, 50, 26, '', { c: 'y' }),
  E('h.lb', 'hex', 760, 136, 54, 48, '♛', { fs: 24 }),
  E('h.tooltip', 'state', 470, 540, 340, 34, 'Needs Star Rank 12 to unlock'),
  E('h.chpop', 'state', 900, 470, 340, 54, 'Popup challenge vừa xong'),
  ...TABS('world'),
];
/** Home behind a popup: no ids (the screen's own elements are checked), faded */
const BEHIND = (op = 0.62, tabs = true) => [...HOME().filter((e) => tabs || !/^[tb]\./.test(e.id) || e.id === 'h.bonus').map((e) => ({ ...e, id: null })).filter((e) => e.s !== 'state'), E(null, 'dim', 0, 0, 1280, 720, '', { op })];
/** a menu page: top bar without the world (as on Shop / Garage in the game), tab bar */
const PAGE = (active) => [E(null, 'scene', 0, 0, 1280, 720), E(null, 'dim', 0, 0, 1280, 720, '', { op: 0.55 }), ...HOME_TOP(false).map((e) => ({ ...e, id: null })), ...TABS(active).map((e) => ({ ...e, id: null }))];
const TOPONLY = (world = true) => [E(null, 'scene', 0, 0, 1280, 720), E(null, 'dim', 0, 0, 1280, 720, '', { op: 0.7 }), ...HOME_TOP(world).map((e) => ({ ...e, id: null }))];

/** one challenge slot; ids only on the first */
function chSlot(x, y, w, h, ids, vertical = false) {
  const i = (k) => (ids ? k : null);
  if (vertical) return [
    E(null, 'cham', x, y, w, h, '', { c: 'k' }),
    E(i('c.hard'), 'hex', x + 12, y + 12, 34, 30, '☠', { c: 'y', fs: 16 }),
    E(i('c.check'), 'hex', x + w - 46, y + 12, 34, 30, '✓', { c: 'g', fs: 16 }),
    E(i('c.text'), 'text', x + 10, y + 50, w - 20, 70, 'Earn 20 Score', { fs: 20 }),
    E(i('c.fill'), 'fill', x + 20, y + 130, w - 40, 18, '', { p: 0.3 }),
    E(i('c.reward'), 'hex', x + w / 2 - 34, y + 165, 68, 58, '★ 1', { fs: 18 }),
    E(i('c.skip'), 'hex', x + w - 56, y + h - 50, 44, 38, '⏭', { fs: 16 }),
  ];
  return [
    E(null, 'cham', x, y, w, h, '', { c: 'k' }),
    E(i('c.hard'), 'hex', x + 8, y + h / 2 - 15, 34, 30, '☠', { c: 'y', fs: 16 }),
    E(i('c.text'), 'text', x + 48, y + 6, w - 200, h / 2, 'Earn 20 Score', { al: 'l', fs: 17 }),
    E(i('c.fill'), 'fill', x + 56, y + h - 22, w - 220, 12, '', { p: 0.3 }),
    E(i('c.check'), 'hex', x + w - 150, y + h / 2 - 15, 34, 30, '✓', { c: 'g', fs: 16 }),
    E(i('c.reward'), 'hex', x + w - 108, y + h / 2 - 22, 50, 44, '★', { fs: 18 }),
    E(i('c.skip'), 'hex', x + w - 52, y + h / 2 - 19, 44, 38, '⏭', { fs: 16 }),
  ];
}
/** a level entry */
const lvItem = (x, y, w, h, n, id, tile = false) => tile
  ? [E(id, 'cham', x, y, w, h, `Easy ${n}\n★ ★ ★\n--.---`, { fs: 18 })]
  : [E(id, 'cham', x, y, w, h, '', {}), E(null, 'text', x, y, w * 0.4, h, `Easy ${n}`, { al: 'l', fs: 17 }), E(null, 'text', x + w * 0.35, y, w * 0.3, h, '--.---', { fs: 16 }), E(null, 'text', x + w * 0.65, y, w * 0.33, h, '★ ★ ★', { al: 'r', fs: 18 })];
const stat = (id, x, y, w, h, head, rows) => [E(id, 'cham', x, y, w, h, '', { c: 'k' }), E(null, 'text', x, y + 6, w, 30, head, { fs: 18 }), ...rows.map((r, i) => E(null, 'fill', x + 20, y + 46 + i * 34, w - 40, 22, r, { p: 0.1, fs: 13 }))];
const entry = (x, y, w, h, n, id, extra = []) => [
  E(id, 'cham', x, y, w, h, '', { c: n === 12 ? 'a' : 'k' }),
  E(null, 'star', x + 14, y + h / 2 - 28, 56, 56, String(n), { fs: 16 }),
  E(null, 'rect', x + 86, y + 10, h - 20, h - 20, '🎴', { fs: 22 }),
  E(null, 'text', x + 86 + h, y + 6, w - h - 160, h / 3, n === 12 ? 'Next Reward' : '', { al: 'l', c: 'y', fs: 13 }),
  E(null, 'text', x + 86 + h, y + h / 3, w - h - 160, h / 3, 'RANDOM TRAIL', { al: 'l', fs: 18 }),
  E(null, 'text', x + 86 + h, y + (2 * h) / 3 - 4, w - h - 160, h / 3, 'trail', { al: 'l', fs: 13, thin: true }),
  ...extra,
];
const card = (x, y, w, h, t, id = null, locked = false) => E(id, 'cham', x, y, w, h, t, { c: locked ? 'k' : 'g', fs: 13 });

// ---------------------------------------------------------------- layouts: LAYOUT[screen](concept) -> elements
const L = {};
L['02'] = (c) => [
  E('tr.bg', 'black', 0, 0, 1280, 720),
  ...({
    A: [E('tr.navL', 'hex', 420, 312, 80, 62, '«', { fs: 32 }), E('tr.world', 'hex', 520, 270, 240, 140, 'WORLD\n2', { c: 'a', fs: 34 }), E('tr.navR', 'hex', 780, 312, 80, 62, '»', { fs: 32 }), E('tr.lock', 'state', 545, 440, 190, 60, '★ 12'), E('tr.soon', 'state', 520, 515, 240, 34, 'Coming Soon')],
    B: [E('tr.navL', 'hex', 458, 32, 70, 54, '«', { fs: 30 }), E('tr.world', 'hex', 540, 11, 199, 105, 'WORLD\n2', { c: 'a', fs: 26 }), E('tr.navR', 'hex', 753, 32, 70, 54, '»', { fs: 30 }), E('tr.lock', 'state', 545, 300, 190, 70, '★ 12'), E('tr.soon', 'state', 520, 385, 240, 34, 'Coming Soon')],
    C: [E('tr.navL', 'hex', 24, 330, 80, 62, '«', { fs: 32 }), E('tr.world', 'hex', 480, 190, 320, 190, 'WORLD\n2', { c: 'a', fs: 44 }), E('tr.navR', 'hex', 1176, 330, 80, 62, '»', { fs: 32 }), E('tr.lock', 'state', 545, 410, 190, 60, '★ 12'), E('tr.soon', 'state', 480, 485, 320, 40, 'Coming Soon')],
  })[c],
];
L['03'] = () => HOME();
L['04'] = (c) => ({
  A: [...BEHIND(), E(null, 'cham', 330, 130, 620, 430), E('c.title', 'text', 330, 142, 620, 40, 'WORLD 1 CHALLENGES', { fs: 26 }), E('c.done', 'text', 330, 182, 620, 26, 'Completed 0/50', { fs: 17, thin: true }), E('c.close', 'hex', 914, 114, 58, 50, '✕', { fs: 22 }),
    ...chSlot(360, 222, 560, 70, true), E('c.timed', 'state', 360, 304, 560, 70, 'Next Challenge in 12:00:00  (+ skip)'), E('c.reset', 'hex', 866, 320, 44, 38, '⏱', { fs: 16 }), E('c.locked', 'state', 360, 386, 560, 70, '🔒 Needs 8 stars to unlock'), E('c.allDone', 'state', 360, 472, 560, 60, "You've completed all World Challenges!")],
  B: [...BEHIND(0.35), E(null, 'cham', 760, 128, 500, 452), E('c.title', 'text', 760, 140, 440, 40, 'WORLD 1 CHALLENGES', { fs: 24, al: 'l' }), E('c.done', 'text', 760, 178, 440, 26, 'Completed 0/50', { fs: 16, al: 'l', thin: true }), E('c.close', 'hex', 1196, 138, 52, 46, '✕', { fs: 20 }),
    ...chSlot(780, 220, 460, 72, true), E('c.timed', 'state', 780, 304, 460, 72, 'Next Challenge in 12:00:00 (+ skip)'), E('c.reset', 'hex', 1186, 321, 44, 38, '⏱', { fs: 16 }), E('c.locked', 'state', 780, 388, 460, 72, '🔒 Needs 8 stars to unlock'), E('c.allDone', 'state', 780, 474, 460, 88, "You've completed all\nWorld Challenges!")],
  C: [...BEHIND(), E('c.title', 'text', 340, 130, 600, 44, 'WORLD 1 CHALLENGES', { fs: 30 }), E('c.done', 'text', 340, 172, 600, 26, 'Completed 0/50', { fs: 17, thin: true }), E('c.close', 'hex', 1170, 128, 60, 52, '✕', { fs: 22 }),
    ...chSlot(130, 215, 320, 260, true, true), E('c.timed', 'state', 480, 215, 320, 260, 'Next Challenge in\n12:00:00\n(+ skip)'), E('c.reset', 'hex', 618, 420, 44, 38, '⏱', { fs: 16 }), E('c.locked', 'state', 830, 215, 320, 260, '🔒\nNeeds 8 stars\nto unlock'), E('c.allDone', 'state', 340, 492, 600, 44, "You've completed all World Challenges!")],
})[c];
L['04b'] = (c) => {
  const pop = (x, y, w, h, row) => [E(null, 'cham', x, y, w, h), E('cr.title', 'text', x, y + 14, w, 36, 'TIMED CHALLENGE ????', { fs: 22 }), E('cr.info', 'text', x, y + 52, w, 28, 'Are you sure?', { fs: 17, thin: true }), E('cr.close', 'hex', x + w - 34, y - 18, 52, 46, '✕', { fs: 20 }),
    ...(row ? [E('cr.ad', 'cham', x + 30, y + h - 76, (w - 80) / 2, 56, '📺 12:00:00', { c: 'b', fs: 17 }), E('cr.ruby', 'cham', x + w / 2 + 10, y + h - 76, (w - 80) / 2, 56, '⬢ 20', { fs: 18 })]
      : [E('cr.ad', 'cham', x + 30, y + 96, w - 60, 54, '📺 12:00:00', { c: 'b', fs: 17 }), E('cr.ruby', 'cham', x + 30, y + 162, w - 60, 54, '⬢ 20', { fs: 18 })])];
  return { A: [...BEHIND(), ...pop(440, 230, 400, 230, true)], B: [...BEHIND(0.35), ...pop(820, 200, 400, 240, false)], C: [...BEHIND(), E(null, 'cham', 0, 520, 1280, 200), E('cr.title', 'text', 60, 545, 520, 40, 'TIMED CHALLENGE ????', { fs: 24, al: 'l' }), E('cr.info', 'text', 60, 590, 520, 30, 'Are you sure?', { fs: 18, al: 'l', thin: true }), E('cr.ad', 'cham', 640, 560, 260, 64, '📺 12:00:00', { c: 'b', fs: 18 }), E('cr.ruby', 'cham', 920, 560, 220, 64, '⬢ 20', { fs: 20 }), E('cr.close', 'hex', 1170, 556, 70, 62, '✕', { fs: 22 })] }[c];
};
L['05'] = (c) => {
  const items = [];
  if (c === 'A') for (let i = 0; i < 8; i++) items.push(...lvItem(i < 4 ? 220 : 660, 205 + (i % 4) * 66, 400, 56, i + 1, i ? null : 'l.item'));
  if (c === 'B') for (let i = 0; i < 8; i++) items.push(...lvItem(760, 196 + i * 44, 480, 38, i + 1, i ? null : 'l.item'));
  if (c === 'C') for (let i = 0; i < 8; i++) items.push(...lvItem(420 + (i % 4) * 206, 140 + Math.floor(i / 4) * 196, 190, 176, i + 1, i ? null : 'l.item', true));
  return {
    A: [...TOPONLY(), E('l.bg', 'ghost', 190, 130, 900, 450, ''), E(null, 'cham', 190, 130, 900, 450), E('l.title', 'text', 280, 140, 720, 50, 'EASY LEVELS', { fs: 28 }), E('l.arrowL', 'hex', 210, 138, 62, 54, '«', { fs: 28 }), E('l.arrowR', 'hex', 1008, 138, 62, 54, '»', { fs: 28 }), E('l.badge', 'badge', 1052, 128, 26, 26, '!'), ...items, E('l.total', 'pill', 220, 480, 220, 40, 'Total ★ 0/24', { fs: 17 }), E('l.locked', 'state', 680, 476, 380, 46, '★ 12 (trang khoá)'), E('l.close', 'hex', 610, 530, 60, 52, '✕', { fs: 22 })],
    B: [...TOPONLY(), E(null, 'ghost', 314, 400, 400, 136, 'Bệ + xe vẫn thấy'), E('l.bg', 'ghost', 740, 124, 520, 460, ''), E(null, 'cham', 740, 124, 520, 460), E('l.arrowL', 'hex', 752, 136, 56, 48, '«', { fs: 26 }), E('l.title', 'text', 810, 136, 380, 48, 'EASY LEVELS', { fs: 24 }), E('l.arrowR', 'hex', 1192, 136, 56, 48, '»', { fs: 26 }), E('l.badge', 'badge', 1232, 126, 24, 24, '!'), ...items, E('l.total', 'pill', 760, 540, 220, 36, 'Total ★ 0/24', { fs: 16 }), E('l.locked', 'state', 990, 538, 180, 40, '★ 12 (khoá)'), E('l.close', 'hex', 1186, 532, 60, 50, '✕', { fs: 22 })],
    C: [...TOPONLY(), E('l.bg', 'ghost', 0, 124, 1280, 596, ''), E('l.title', 'text', 40, 150, 340, 90, 'EASY\nLEVELS', { fs: 40 }), E('l.arrowL', 'hex', 60, 260, 100, 76, '«', { fs: 34 }), E('l.arrowR', 'hex', 250, 260, 100, 76, '»', { fs: 34 }), E('l.badge', 'badge', 330, 250, 28, 28, '!'), E('l.total', 'pill', 60, 360, 290, 50, 'Total ★ 0/24', { fs: 20 }), E('l.close', 'hex', 150, 600, 100, 80, '✕', { fs: 30 }), ...items, E('l.locked', 'state', 420, 540, 800, 50, '★ 12 (phủ lên lưới khi trang khoá)')],
  }[c];
};
L['06'] = (c) => ({
  A: [...TOPONLY(), E('s.bg', 'ghost', 240, 124, 800, 466, ''), E(null, 'cham', 240, 124, 800, 466), E('s.title', 'text', 240, 132, 800, 40, 'PROGRESS', { fs: 28 }), E('s.fill', 'fill', 280, 176, 720, 26, '6%', { p: 0.06, fs: 15 }),
    ...stat('s.endless', 280, 214, 720, 112, '▶ ENDLESS', ['World Challenges 0/50', 'High Score 0/200']), ...stat('s.levels', 280, 334, 350, 150, '⏱ LEVELS', ['Easy ★ 0/8', 'Moderate ★ 0/8', 'Difficult ★ 0/8']), ...stat('s.coll', 650, 334, 350, 150, '🏍 COLLECTION', ['Vehicles', 'Colors', 'Trails']), E('s.close', 'hex', 610, 512, 60, 52, '✕', { fs: 22 })],
  B: [...TOPONLY(), E(null, 'ghost', 314, 400, 400, 136, 'Bệ + xe vẫn thấy'), E('s.bg', 'ghost', 740, 124, 520, 460, ''), E(null, 'cham', 740, 124, 520, 460), E('s.title', 'text', 760, 132, 420, 40, 'PROGRESS', { fs: 24, al: 'l' }), E('s.close', 'hex', 1192, 132, 56, 48, '✕', { fs: 20 }), E('s.fill', 'fill', 760, 180, 480, 24, '6%', { p: 0.06, fs: 14 }),
    ...stat('s.endless', 760, 214, 480, 110, '▶ ENDLESS', ['World Challenges 0/50', 'High Score 0/200']), ...stat('s.levels', 760, 330, 480, 144, '⏱ LEVELS', ['Easy ★ 0/8', 'Moderate ★ 0/8', 'Difficult ★ 0/8']), ...stat('s.coll', 760, 480, 480, 96, '🏍 COLLECTION', ['Vehicles'])],
  C: [...TOPONLY(), E('s.bg', 'ghost', 0, 124, 1280, 596, ''), E(null, 'cham', 120, 132, 1040, 76), E('s.title', 'text', 140, 140, 260, 60, 'PROGRESS', { fs: 30, al: 'l' }), E('s.fill', 'fill', 420, 156, 700, 28, '6%', { p: 0.06, fs: 16 }),
    ...stat('s.endless', 120, 228, 330, 300, '▶ ENDLESS', ['World Challenges 0/50', 'High Score 0/200']), ...stat('s.levels', 475, 228, 330, 300, '⏱ LEVELS', ['Easy ★ 0/8', 'Moderate ★ 0/8', 'Difficult ★ 0/8']), ...stat('s.coll', 830, 228, 330, 300, '🏍 COLLECTION', ['Vehicles', 'Colors', 'Trails', 'Landing', 'Death']), E('s.close', 'hex', 600, 560, 80, 66, '✕', { fs: 26 })],
})[c];
L['07'] = (c) => {
  const es = [];
  if (c === 'A') for (let i = 0; i < 5; i++) es.push(...entry(190, 128 + i * 90, 900, 82, 12 + i, i ? null : 'r.entry'));
  if (c === 'C') for (let i = 0; i < 5; i++) es.push(...entry(400, 128 + i * 90, 840, 82, 12 + i, i ? null : 'r.entry'));
  if (c === 'B') for (let i = 0; i < 5; i++) es.push(E(i ? null : 'r.entry', 'cham', 40 + i * 244, 170, 228, 360, `★ ${12 + i}\n\n🎴\n\n${i ? '' : 'Next Reward\n'}RANDOM TRAIL\ntrail`, { c: i ? 'k' : 'a', fs: 16 }));
  const head = { A: [E(null, 'cham', 0, 0, 1280, 116, '', { c: 'k' }), E('r.title', 'text', 440, 8, 400, 36, 'STAR RANK', { fs: 26 }), E('r.rank', 'star', 330, 40, 66, 64, '12'), E('r.fill', 'fill', 410, 58, 460, 28, '0 / 6 ★', { p: 0.2 }), E('r.next', 'star', 884, 40, 66, 64, '13')],
    B: [E(null, 'cham', 0, 0, 1280, 140, '', { c: 'k' }), E('r.title', 'text', 440, 10, 400, 40, 'STAR RANK', { fs: 28 }), E('r.rank', 'star', 300, 56, 74, 72, '12'), E('r.fill', 'fill', 390, 78, 500, 30, '0 / 6 ★', { p: 0.2 }), E('r.next', 'star', 906, 56, 74, 72, '13')],
    C: [E(null, 'cham', 30, 128, 340, 450, '', { c: 'k' }), E('r.title', 'text', 30, 140, 340, 44, 'STAR RANK', { fs: 30 }), E('r.rank', 'star', 120, 196, 160, 150, '12', { fs: 36 }), E('r.fill', 'fill', 60, 370, 280, 32, '0 / 6 ★', { p: 0.2 }), E('r.next', 'star', 160, 416, 80, 76, '13')] }[c];
  const rest = {
    A: [E('r.claimed', 'state', 960, 128, 120, 82, 'Claimed ✓'), E('r.lock', 'hex', 1030, 316, 50, 44, '🔒', { fs: 18 }), E('r.close', 'hex', 610, 590, 60, 52, '✕', { fs: 22 })],
    B: [E(null, 'fill', 40, 548, 1200, 14, '', { p: 0.08 }), E('r.claimed', 'state', 54, 440, 200, 40, 'Claimed ✓'), E('r.lock', 'hex', 300, 470, 50, 44, '🔒', { fs: 18 }), E('r.close', 'hex', 1180, 620, 70, 60, '✕', { fs: 24 })],
    C: [E('r.claimed', 'state', 1110, 128, 120, 82, 'Claimed ✓'), E('r.lock', 'hex', 1180, 316, 50, 44, '🔒', { fs: 18 }), E('r.close', 'hex', 165, 512, 70, 56, '✕', { fs: 22 })],
  }[c];
  return [E(null, 'scene', 0, 0, 1280, 720), E(null, 'dim', 0, 0, 1280, 720, '', { op: 0.75 }), ...head, ...es, ...rest];
};
L['08'] = (c) => {
  const grid = (x, y, w, cols, gap = 10) => {
    const cw = (w - gap * (cols - 1)) / cols, out = [E('g.world', 'text', x, y, w, 26, 'WORLD 1', { fs: 15 })];
    for (let i = 0; i < cols; i++) out.push(card(x + i * (cw + gap), y + 30, cw, cw * 1.12, i === 2 ? '' : `Muscle Max\n0 / 2`, i === 0 ? 'g.card' : null));
    out.push(E('g.clock', 'cham', x + 2 * (cw + gap), y + 30, cw, cw * 1.12, 'Unlocks in\nWorld 1', { c: 'k', fs: 12 }));
    out.push(E(null, 'text', x, y + 40 + cw * 1.12, w, 24, 'WORLD 2', { fs: 15 }));
    for (let i = 0; i < cols; i++) out.push(card(x + i * (cw + gap), y + 68 + cw * 1.12, cw, cw * 1.12, 'Unlocks in\nWorld 2', null, true));
    return out;
  };
  const tabs = (vertical, x, y, size) => {
    const out = [], names = ['🏍', '🎨', '〰', '💥', '☠'];
    for (let i = 0; i < 5; i++) out.push(E(i ? null : 'g.tabs', 'cham', vertical ? x : x + i * size.w, vertical ? y + i * size.h : y, size.w - 6, size.h - 6, names[i], { c: i ? 'n' : 'a', fs: 24 }));
    out.push(E('g.tbadge', 'badge', vertical ? x + size.w - 30 : x + size.w - 30, vertical ? y - 6 : y - 8, 24, 24, '!'));
    return out;
  };
  const skins = (x, y, s) => [0, 1, 2, 3].map((i) => E(i ? null : 'g.skins', 'hex', x + i * (s + 10), y, s, s * 0.9, i ? 'Preview' : '🏍', { c: i ? 'n' : 'a', fs: 12 })).concat([E('g.plock', 'state', x + 3 * (s + 10), y + s * 0.9 + 4, s, 22, '🔒')]);
  return {
    A: [...PAGE('veh'), ...tabs(true, 30, 128, { w: 96, h: 88 }), E('g.name', 'text', 440, 116, 400, 34, 'RIDER', { fs: 26 }), E('g.rarity', 'text', 440, 148, 400, 22, 'Common', { color: '#3cff8f', fs: 16 }), E('g.amount', 'state', 860, 128, 160, 30, '0/2'), E('g.preview', 'ghost', 440, 172, 400, 168, 'Xe 3D'), ...skins(470, 346, 72), E(null, 'cham', 140, 432, 1110, 150, '', { c: 'k' }), ...grid(150, 436, 560, 6, 8).slice(0, 8)],
    B: [...PAGE('veh'), E('g.name', 'text', 40, 120, 560, 40, 'RIDER', { fs: 30 }), E('g.rarity', 'text', 40, 158, 560, 24, 'Common', { color: '#3cff8f', fs: 17 }), E('g.amount', 'state', 220, 186, 200, 28, '0/2'), E('g.preview', 'ghost', 40, 220, 560, 250, 'Xe 3D'), ...skins(110, 482, 90), E(null, 'cham', 630, 120, 630, 462, '', { c: 'k' }), ...tabs(false, 640, 130, { w: 122, h: 66 }), ...grid(650, 204, 590, 5)],
    C: [...PAGE('veh'), ...tabs(true, 24, 124, { w: 86, h: 92 }), E(null, 'cham', 118, 120, 650, 462, '', { c: 'k' }), ...grid(130, 126, 626, 5), E('g.name', 'text', 790, 120, 460, 40, 'RIDER', { fs: 30 }), E('g.rarity', 'text', 790, 158, 460, 24, 'Common', { color: '#3cff8f', fs: 17 }), E('g.amount', 'state', 940, 186, 160, 28, '0/2'), E('g.preview', 'ghost', 790, 220, 460, 240, 'Xe 3D'), ...skins(810, 474, 98)],
  }[c];
};
L['09'] = (c) => {
  const header = (id, x, y, w, t, timer) => [E(id, 'cham', x, y, w, 40, t, { c: 'a', fs: 20 }), ...(timer ? [E(null, 'text', x, y + 40, w, 20, timer, { fs: 12, color: '#3c8bff', thin: true })] : [])];
  const free = (x, y, w) => [...header('sp.freeH', x, y, w, 'FREE REWARDS', 'Refresh in 8:51:12'), E('sp.ad', 'cham', x + 10, y + 70, 70, 70, '📺', { c: 'y', fs: 26 }), E('sp.freeBar', 'fill', x + 90, y + 145, w - 110, 10, '', { p: 0.2 }),
    ...[0, 1, 2, 3, 4].map((i) => E(i ? null : 'sp.freeItem', 'cham', x + 90 + i * ((w - 110) / 5), y + 66, (w - 110) / 5 - 8, 74, ['◆\n250', '?\n1', '⬢\n20', '🎴\n1', '🧰\n1'][i], { fs: 15 })), E('sp.freeTxt', 'text', x, y + 160, w, 22, 'Watch 3 Rewarded Videos for the Next Reward', { fs: 12, thin: true })];
  const chests = (x, y, w, h = 150) => [...header('sp.chestH', x, y, w, 'CHESTS'), E('sp.chest', 'cham', x + w / 2 - 190, y + 50, 170, h - 54, 'SMALL\n🧰\n⏵ FREE', { fs: 16 }), E('sp.chestL', 'cham', x + w / 2 + 20, y + 50, 170, h - 54, 'LARGE\n🧰\n500 ◆', { c: 'y', fs: 16 }), E(null, 'text', x + w / 2 + 20, y + 44, 170, 16, 'Most popular!', { fs: 11, c: 'y' })];
  const deals = (x, y, w, h = 160) => [...header('sp.dealH', x, y, w, 'DAILY DEALS', 'New deals in 8:51:12'), ...[0, 1, 2].map((i) => E(i ? null : 'sp.deal', 'cham', x + 10 + i * ((w - 90) / 3), y + 64, (w - 90) / 3 - 10, h - 68, 'Photon\nRare\n🎴 x2\n120 ◆', { fs: 13 })), E('sp.refresh', 'hex', x + w - 74, y + 64 + (h - 68) / 2 - 28, 64, 56, '⟳', { c: 'b', fs: 22 })];
  const rubies = (x, y, w, h = 150) => [...header('sp.rubyH', x, y, w, 'RUBIES'), E('sp.gift', 'cham', x + 10, y + 50, (w - 30) / 3, h - 54, '📺 Get Rubies!\n⬢ 5', { c: 'y', fs: 14 }), ...[0, 1].map((i) => E(i ? null : 'sp.rubyItem', 'cham', x + 20 + (i + 1) * ((w - 30) / 3), y + 50, (w - 30) / 3 - 10, h - 54, '⬢\n80 Rubies\nNot Available', { c: 'k', fs: 13 }))];
  return {
    // A: one row per section, the section label on the left, items to the right (no scroll)
    A: [...PAGE('shop'), E('sp.bg', 'ghost', 0, 116, 1280, 470, ''),
      E('sp.freeH', 'cham', 30, 124, 210, 104, 'FREE\nREWARDS\n8:51:12', { c: 'a', fs: 16 }), E('sp.ad', 'cham', 252, 132, 80, 72, '📺', { c: 'y', fs: 26 }), ...[0, 1, 2, 3, 4].map((i) => E(i ? null : 'sp.freeItem', 'cham', 344 + i * 120, 128, 110, 70, ['◆ 250', '? 1', '⬢ 20', '🎴 1', '🧰 1'][i], { fs: 15 })), E('sp.freeBar', 'fill', 344, 202, 590, 10, '', { p: 0.2 }), E('sp.freeTxt', 'text', 944, 128, 306, 84, 'Watch 3 Rewarded\nVideos for the\nNext Reward', { fs: 13, thin: true }),
      E('sp.chestH', 'cham', 30, 238, 210, 104, 'CHESTS', { c: 'a', fs: 18 }), E('sp.chest', 'cham', 252, 238, 300, 104, 'SMALL  🧰  ⏵ FREE', { fs: 16 }), E('sp.chestL', 'cham', 566, 238, 300, 104, 'LARGE  🧰  500 ◆', { c: 'y', fs: 16 }), E(null, 'text', 566, 232, 300, 14, 'Most popular!', { fs: 11, c: 'y' }),
      E('sp.dealH', 'cham', 30, 352, 210, 104, 'DAILY\nDEALS\n8:51:12', { c: 'a', fs: 16 }), ...[0, 1, 2].map((i) => E(i ? null : 'sp.deal', 'cham', 252 + i * 300, 352, 290, 104, '🎴 Photon · Rare · x2 · 120 ◆', { fs: 14 })), E('sp.refresh', 'hex', 1160, 372, 72, 64, '⟳', { c: 'b', fs: 24 }),
      E('sp.rubyH', 'cham', 30, 466, 210, 104, 'RUBIES', { c: 'a', fs: 18 }), E('sp.gift', 'cham', 252, 466, 300, 104, '📺 Get Rubies!  ⬢ 5', { c: 'y', fs: 16 }), ...[0, 1].map((i) => E(i ? null : 'sp.rubyItem', 'cham', 566 + i * 314, 466, 300, 104, '⬢ 80 Rubies · Not Available', { c: 'k', fs: 14 }))],
    B: [...PAGE('shop'), E('sp.bg', 'ghost', 0, 116, 1280, 470, ''), ...free(20, 126, 400), ...chests(440, 126, 400, 200), ...deals(860, 126, 400, 200), ...rubies(20, 360, 400, 210)],
    C: [...PAGE('shop'), E('sp.bg', 'ghost', 0, 116, 1280, 470, ''), ...free(30, 126, 600), ...chests(30, 330, 600, 250), ...deals(650, 126, 600, 220), ...rubies(650, 380, 600, 200)],
  }[c];
};
L['09b'] = (c) => {
  const conf = (x, y, w, h) => [E(null, 'cham', x, y, w, h), E('sc.title', 'text', x, y + 12, w, 36, 'CHEST', { fs: 26 }), E('sc.rarity', 'text', x, y + 46, w, 22, 'common', { fs: 15, thin: true }), E('sc.icon', 'rect', x + w / 2 - 70, y + 80, 140, 120, '🧰', { fs: 46 }), E('sc.info', 'cham', x + 30, y + 212, w - 60, 44, 'Contains: 🎴 8', { c: 'k', fs: 16 }), E('sc.buy', 'cham', x + w / 2 - 110, y + h - 70, 220, 54, '1224 ◆', { c: 'g', fs: 20 }), E('sc.close', 'hex', x + w - 34, y - 18, 52, 46, '✕', { fs: 20 })];
  const ref = (x, y, w, h) => [E(null, 'cham', x, y, w, h), E('sr.title', 'text', x, y + 10, w, 34, 'DAILY DEALS REFRESH', { fs: 18 }), E('sr.count', 'text', x, y + 44, w, 24, 'x/3', { fs: 16 }), E('sr.info', 'text', x, y + 70, w, 24, 'Are you sure?', { fs: 15, thin: true }), E('sr.ad', 'cham', x + w / 2 - 90, y + h - 64, 180, 50, '📺', { c: 'b', fs: 22 })];
  return {
    A: [...PAGE('shop').slice(0, 2), E(null, 'dim', 0, 0, 1280, 720, '', { op: 0.5 }), ...conf(170, 150, 440, 420), ...ref(690, 220, 420, 210)],
    B: [...PAGE('shop').slice(0, 2), E(null, 'dim', 0, 0, 1280, 720, '', { op: 0.3 }), ...conf(820, 130, 420, 450), E(null, 'state', 80, 220, 420, 210, 'Popup làm mới: cùng khung bên phải'), ...ref(80, 220, 420, 210)],
    C: [...PAGE('shop').slice(0, 2), E(null, 'dim', 0, 0, 1280, 720, '', { op: 0.5 }), E(null, 'cham', 0, 440, 1280, 280), E('sc.icon', 'rect', 60, 470, 200, 200, '🧰', { fs: 60 }), E('sc.title', 'text', 290, 470, 400, 44, 'CHEST', { fs: 30, al: 'l' }), E('sc.rarity', 'text', 290, 514, 400, 24, 'common', { fs: 16, al: 'l', thin: true }), E('sc.info', 'cham', 290, 556, 360, 48, 'Contains: 🎴 8', { c: 'k', fs: 17 }), E('sc.buy', 'cham', 900, 540, 260, 70, '1224 ◆', { c: 'g', fs: 24 }), E('sc.close', 'hex', 1190, 450, 64, 56, '✕', { fs: 22 }), ...ref(430, 130, 420, 210)],
  }[c];
};
L['10'] = (c) => {
  const btns = (x, y, s, gap, vertical) => ['st.music', 'st.sfx', 'st.bloom'].map((id, i) => E(id, 'hex', vertical ? x : x + i * (s + gap), vertical ? y + i * (s * 0.9 + gap) : y, s, s * 0.9, ['♪', '🔊', '✺'][i], { fs: s * 0.35 }));
  return {
    A: [...BEHIND(), E(null, 'cham', 440, 210, 400, 270), E('st.title', 'text', 440, 222, 400, 44, 'SETTINGS', { fs: 28 }), ...btns(484, 286, 86, 22), E('st.cpr', 'text', 440, 390, 400, 60, 'V26102306\n© 2026 Azgames.io', { fs: 15, thin: true }), E('st.close', 'hex', 806, 190, 56, 48, '✕', { fs: 20 })],
    B: [...BEHIND(0.35), E(null, 'cham', 1004, 96, 256, 440), E('st.title', 'text', 1004, 106, 256, 40, 'SETTINGS', { fs: 24 }), ...btns(1082, 158, 100, 18, true), E('st.cpr', 'text', 1004, 454, 256, 60, 'V26102306\n© 2026 Azgames.io', { fs: 14, thin: true }), E('st.close', 'hex', 1210, 88, 52, 46, '✕', { fs: 20 })],
    C: [...BEHIND(), E(null, 'cham', 200, 300, 880, 130), E('st.title', 'text', 220, 312, 230, 60, 'SETTINGS', { fs: 28, al: 'l' }), E('st.cpr', 'text', 220, 370, 230, 50, 'V26102306\n© 2026 Azgames.io', { fs: 13, thin: true, al: 'l' }), ...btns(520, 318, 100, 30), E('st.close', 'hex', 960, 330, 90, 72, '✕', { fs: 26 })],
  }[c];
};
L['11'] = (c) => {
  const rows = (x, y, w, n, h = 40) => [...Array(n)].flatMap((_, i) => [E(i ? null : 'lb.row', 'cham', x, y + i * (h + 4), w, h, `#${i + 1}  ▭  FastGecko284`, { c: 'k', fs: 14, al: 'l' }), E(null, 'text', x, y + i * (h + 4), w, h, String(63 - i * 5), { fs: 14, al: 'r' })]);
  const tabs = (x, y, w, h, vertical) => ['Today', 'This week', 'This month', 'All time'].map((t, i) => E(i ? null : 'lb.tabs', 'cham', vertical ? x : x + i * (w / 4), vertical ? y + i * (h + 8) : y, vertical ? w : w / 4 - 6, h, t, { c: i === 3 ? 'a' : 'n', fs: 14 }));
  return {
    A: [...BEHIND(), E(null, 'cham', 340, 110, 600, 500), E('lb.title', 'text', 340, 120, 600, 44, 'LEADERBOARD', { fs: 26 }), E('lb.close', 'hex', 906, 92, 56, 48, '✕', { fs: 20 }), ...tabs(360, 170, 560, 40), ...rows(360, 222, 560, 6), E('lb.note', 'state', 360, 488, 270, 40, 'Loading… / Try again'), E('lb.more', 'cham', 650, 488, 270, 40, 'More', { fs: 15 }), E('lb.me', 'cham', 360, 540, 400, 52, '–  🇺🇸  NeatYak337   No score yet', { c: 'a', fs: 14, al: 'l' }), E('lb.edit', 'cham', 770, 540, 150, 52, 'Name & flag', { fs: 14 })],
    B: [...BEHIND(0.35), E(null, 'cham', 760, 0, 520, 720), E('lb.title', 'text', 780, 14, 400, 44, 'LEADERBOARD', { fs: 26, al: 'l' }), E('lb.close', 'hex', 1206, 12, 56, 48, '✕', { fs: 20 }), ...tabs(780, 70, 480, 40), ...rows(780, 122, 480, 10), E('lb.note', 'state', 780, 562, 230, 36, 'Loading… / Try again'), E('lb.more', 'cham', 1030, 562, 230, 36, 'More', { fs: 15 }), E('lb.me', 'cham', 780, 612, 480, 44, '–  🇺🇸  NeatYak337   No score yet', { c: 'a', fs: 14, al: 'l' }), E('lb.edit', 'cham', 1080, 664, 180, 44, 'Name & flag', { fs: 14 })],
    C: [...BEHIND(), E(null, 'cham', 120, 110, 1040, 500), E('lb.title', 'text', 140, 124, 300, 50, 'LEADERBOARD', { fs: 26, al: 'l' }), E('lb.close', 'hex', 1126, 92, 56, 48, '✕', { fs: 20 }), ...tabs(150, 190, 250, 50, true), E('lb.me', 'cham', 150, 432, 250, 80, '–  🇺🇸  NeatYak337\nNo score yet', { c: 'a', fs: 14 }), E('lb.edit', 'cham', 150, 524, 250, 50, 'Name & flag', { fs: 15 }), ...rows(430, 130, 710, 9), E('lb.note', 'state', 430, 536, 340, 40, 'Loading… / Try again'), E('lb.more', 'cham', 800, 536, 340, 40, 'More', { fs: 15 })],
  }[c];
};
L['11b'] = (c) => {
  const form = (x, y, w) => [E('lf.title', 'text', x, y, w - 60, 44, 'NAME & FLAG', { fs: 24, al: 'l' }), E('lf.name', 'cham', x, y + 56, w, 76, 'Name  [ NeatYak337            ]\nUp to 20 letters, numbers, _ or -', { c: 'k', fs: 14, al: 'l' }), E('lf.flag', 'cham', x, y + 144, w, 52, 'Flag  [ 🇺🇸  United States  ▾ ]', { c: 'k', fs: 14, al: 'l' }), E('lf.err', 'state', x, y + 208, w, 34, 'Could not save. Check the name and try again.'), E('lf.cancel', 'cham', x + w - 300, y + 256, 140, 48, 'Cancel', { fs: 15 }), E('lf.save', 'cham', x + w - 150, y + 256, 150, 48, 'Save', { c: 'a', fs: 15 })];
  return {
    A: [...BEHIND(), E(null, 'cham', 340, 160, 600, 360), ...form(370, 176, 540), E('lf.close', 'hex', 906, 142, 56, 48, '✕', { fs: 20 })],
    B: [...BEHIND(0.35), E(null, 'cham', 760, 0, 520, 720), ...form(780, 20, 480), E('lf.close', 'hex', 1206, 12, 56, 48, '✕', { fs: 20 })],
    C: [...BEHIND(), E(null, 'cham', 120, 110, 1040, 500), E(null, 'state', 150, 190, 250, 384, 'Cột trái giữ tab + dòng của tôi'), ...form(440, 150, 690), E('lf.close', 'hex', 1126, 92, 56, 48, '✕', { fs: 20 })],
  }[c];
};
L['12'] = (c) => {
  const bg = E('ru.bg', 'ghost', 0, 0, 1280, 720, '', {});
  const rw = (x, y, w, h) => [E('ru.reward', 'cham', x, y, w / 2 - 10, h, '🎴\nRANDOM TRAIL', { fs: 16 }), E(null, 'cham', x + w / 2 + 10, y, w / 2 - 10, h, '⬢\n20', { fs: 18 })];
  return {
    A: [bg, E('ru.title', 'text', 440, 110, 400, 56, 'RANK UP!', { fs: 40 }), E('ru.star', 'star', 545, 170, 190, 180, '12', { fs: 44 }), ...rw(390, 370, 500, 110), E('ru.rv', 'cham', 530, 500, 220, 56, '📺 x2', { c: 'y', fs: 20 }), E('ru.tap', 'text', 440, 580, 400, 30, 'Tap to continue', { fs: 18, thin: true })],
    B: [bg, E('ru.title', 'text', 130, 130, 460, 60, 'RANK UP!', { fs: 44 }), E('ru.star', 'star', 220, 200, 280, 260, '12', { fs: 60 }), ...rw(640, 200, 540, 200), E('ru.rv', 'cham', 770, 430, 280, 60, '📺 x2', { c: 'y', fs: 22 }), E('ru.tap', 'text', 640, 560, 540, 30, 'Tap to continue', { fs: 18, thin: true })],
    C: [bg, E('ru.star', 'star', 580, 40, 120, 114, '12', { fs: 30 }), E('ru.title', 'text', 390, 160, 500, 56, 'RANK UP!', { fs: 40 }), ...rw(190, 240, 900, 240), E('ru.rv', 'cham', 380, 530, 240, 60, '📺 x2', { c: 'y', fs: 22 }), E('ru.tap', 'text', 660, 545, 260, 30, 'Tap to continue', { fs: 18, thin: true })],
  }[c];
};
L['13'] = (c) => ({
  A: [...BEHIND(), E(null, 'cham', 460, 150, 360, 380, '', { c: 'y' }), E('cb.title', 'text', 460, 162, 360, 40, 'CLAIM BONUS REWARD', { fs: 20 }), E('cb.icon', 'rect', 560, 214, 160, 150, '◆◆◆', { fs: 40 }), E('cb.amount', 'text', 460, 372, 360, 34, '+400 Gems', { fs: 20 }), E('cb.claim', 'cham', 480, 440, 150, 56, 'CLAIM', { fs: 18 }), E('cb.rv', 'cham', 650, 440, 150, 56, '📺 X2 GEMS', { c: 'y', fs: 16 })],
  B: [...BEHIND(0.35), E(null, 'cham', 880, 130, 370, 440, '', { c: 'y' }), E('cb.title', 'text', 880, 144, 370, 40, 'CLAIM BONUS REWARD', { fs: 20 }), E('cb.icon', 'rect', 985, 200, 160, 150, '◆◆◆', { fs: 40 }), E('cb.amount', 'text', 880, 360, 370, 34, '+400 Gems', { fs: 20 }), E('cb.rv', 'cham', 910, 412, 310, 56, '📺 X2 GEMS', { c: 'y', fs: 18 }), E('cb.claim', 'cham', 910, 480, 310, 56, 'CLAIM', { fs: 18 })],
  C: [...BEHIND(), E(null, 'cham', 160, 270, 960, 170, '', { c: 'y' }), E('cb.icon', 'rect', 190, 290, 150, 130, '◆◆◆', { fs: 36 }), E('cb.title', 'text', 360, 296, 420, 44, 'CLAIM BONUS REWARD', { fs: 24, al: 'l' }), E('cb.amount', 'text', 360, 344, 420, 44, '+400 Gems', { fs: 26, al: 'l' }), E('cb.claim', 'cham', 790, 296, 300, 56, 'CLAIM', { fs: 18 }), E('cb.rv', 'cham', 790, 362, 300, 56, '📺 X2 GEMS', { c: 'y', fs: 18 })],
})[c];
L['14'] = (c) => ({
  A: [E('lx.bg', 'ghost', 0, 0, 1280, 720, ''), E('lx.chest', 'ghost', 520, 250, 240, 220, 'Rương 3D'), E('lx.left', 'badge', 740, 240, 50, 50, '8'), E('lx.tap', 'text', 440, 490, 400, 36, 'Tap to Open', { fs: 22, thin: true })],
  B: [E('lx.bg', 'ghost', 0, 0, 1280, 720, ''), E('lx.chest', 'ghost', 140, 200, 380, 340, 'Rương 3D'), E('lx.left', 'badge', 490, 190, 56, 56, '8'), E('lx.tap', 'text', 640, 330, 520, 50, 'Tap to Open', { fs: 30, thin: true })],
  C: [E('lx.bg', 'ghost', 0, 0, 1280, 720, ''), E('lx.chest', 'ghost', 470, 140, 340, 320, 'Rương 3D'), E('lx.left', 'badge', 790, 130, 56, 56, '8'), E('lx.tap', 'cham', 490, 520, 300, 60, 'Tap to Open', { fs: 22 })],
})[c];
L['14b'] = (c) => {
  const grid = (x, y, w, h, cols) => [E('lx.overview', 'cham', x, y, w, h, '', { c: 'k' }), ...[...Array(cols * 2)].map((_, i) => card(x + 16 + (i % cols) * ((w - 32) / cols), y + 16 + Math.floor(i / cols) * ((h - 32) / 2), (w - 32) / cols - 10, (h - 32) / 2 - 10, i % 3 ? 'x1' : 'x2'))];
  const cardBig = (x, y, w, h) => [E('lx.card', 'cham', x, y, w, h, 'PHOTON\nVehicle\n\n🏍\n\n88/88\n+1  Upgraded!', { c: 'g', fs: 17 })];
  return {
    A: [E(null, 'ghost', 0, 0, 1280, 720, ''), ...cardBig(80, 120, 280, 400), ...grid(400, 120, 800, 400, 5), E('lx.lose', 'cham', 400, 560, 220, 60, 'Lose it', { fs: 18 }), E('lx.rv', 'cham', 640, 560, 220, 60, '📺', { c: 'y', fs: 22 }), E('lx.claim', 'cham', 980, 560, 220, 60, 'CLAIM', { c: 'a', fs: 20 })],
    B: [E(null, 'ghost', 0, 0, 1280, 720, ''), ...cardBig(500, 60, 280, 380), E('lx.lose', 'cham', 1000, 180, 240, 60, 'Lose it', { fs: 18 }), E('lx.rv', 'cham', 1000, 260, 240, 60, '📺', { c: 'y', fs: 22 }), E('lx.claim', 'cham', 1000, 360, 240, 70, 'CLAIM', { c: 'a', fs: 20 }), ...grid(40, 470, 1200, 210, 8)],
    C: [E(null, 'ghost', 0, 0, 1280, 720, ''), ...grid(40, 60, 820, 520, 4), ...cardBig(900, 60, 340, 520), E('lx.lose', 'cham', 300, 620, 220, 60, 'Lose it', { fs: 18 }), E('lx.rv', 'cham', 540, 620, 220, 60, '📺', { c: 'y', fs: 22 }), E('lx.claim', 'cham', 780, 620, 220, 60, 'CLAIM', { c: 'a', fs: 20 })],
  }[c];
};
const RUN = () => [E(null, 'scene', 0, 0, 1280, 720), E(null, 'ghost', 0, 430, 1280, 14, ''), E(null, 'ghost', 300, 380, 70, 40, 'xe')];
L['15'] = (c) => {
  const pips = (id, x, y, w) => [E(id, 'cham', x, y, w, 36, 'B  O  N  U  S', { c: 'k', fs: 18 })];
  const common = [E('hd.jump', 'state', 380, 320, 80, 30, '+12'), E('hd.marker', 'state', 820, 300, 150, 120, 'HIGHSCORE\n│')];
  return {
    A: [...RUN(), E('hd.gem', 'pill', 20, 18, 150, 34, '◆ 2', { fs: 16 }), E('hd.best', 'cham', 585, 14, 110, 22, 'NEW BEST!', { c: 'y', fs: 12 }), E('hd.score', 'text', 540, 36, 200, 56, '2', { fs: 46 }), E('hd.timer', 'state', 560, 96, 160, 30, 'Level: 00.000'), E('hd.name', 'state', 520, 130, 240, 26, 'Level: Easy 1'), ...pips('hd.bonus', 530, 166, 220), E('hd.restart', 'hex', 1144, 14, 58, 52, '↻', { fs: 24 }), E('hd.pause', 'hex', 1208, 14, 58, 52, '⏸', { fs: 24 }), E('hd.compliment', 'text', 440, 230, 400, 50, 'DOUBLE FLIP!', { c: 'y', fs: 32 }), E('hd.chpop', 'cham', 400, 640, 480, 60, '🌐 Earn 20 Score  ▬▬▬▭▭', { fs: 16 }), ...common],
    B: [...RUN(), E('hd.score', 'text', 24, 10, 220, 60, '2', { fs: 50, al: 'l' }), E('hd.best', 'cham', 24, 72, 110, 22, 'NEW BEST!', { c: 'y', fs: 12 }), E('hd.gem', 'pill', 24, 102, 150, 32, '◆ 2', { fs: 16 }), ...pips('hd.bonus', 520, 18, 240), E('hd.timer', 'state', 520, 60, 240, 30, 'Level: 00.000 (thay chữ BONUS)'), E('hd.name', 'state', 520, 94, 240, 26, 'Level: Easy 1'), E('hd.restart', 'hex', 1144, 14, 58, 52, '↻', { fs: 24 }), E('hd.pause', 'hex', 1208, 14, 58, 52, '⏸', { fs: 24 }), E('hd.chpop', 'cham', 880, 84, 386, 60, '🌐 Earn 20 Score ▬▬▭▭', { fs: 15 }), E('hd.compliment', 'text', 440, 200, 400, 50, 'DOUBLE FLIP!', { c: 'y', fs: 32 }), ...common],
    C: [...RUN(), E(null, 'cham', 0, 0, 1280, 70, '', { c: 'k' }), E('hd.gem', 'pill', 16, 16, 150, 36, '◆ 2', { fs: 16 }), ...pips('hd.bonus', 186, 16, 230), E('hd.score', 'text', 560, 4, 160, 62, '2', { fs: 44 }), E('hd.best', 'cham', 722, 24, 110, 22, 'NEW BEST!', { c: 'y', fs: 12 }), E('hd.timer', 'state', 860, 16, 140, 36, '00.000'), E('hd.name', 'state', 860, 52, 140, 16, 'Easy 1'), E('hd.restart', 'hex', 1146, 8, 58, 52, '↻', { fs: 24 }), E('hd.pause', 'hex', 1210, 8, 58, 52, '⏸', { fs: 24 }), E('hd.chpop', 'cham', 20, 640, 440, 60, '🌐 Earn 20 Score ▬▬▭▭', { fs: 15 }), E('hd.compliment', 'text', 440, 200, 400, 50, 'DOUBLE FLIP!', { c: 'y', fs: 32 }), ...common],
  }[c];
};
L['16'] = (c) => {
  const btns = (x, y, s, gap, cols) => ['p.home', 'p.music', 'p.sfx', 'p.bloom'].map((id, i) => E(id, 'hex', x + (i % cols) * (s + gap), y + Math.floor(i / cols) * (s * 0.9 + gap), s, s * 0.9, ['⏏', '♪', '🔊', '✺'][i], { fs: s * 0.33 }));
  const chs = (x, y, w, h, gap) => [0, 1, 2].map((i) => E(i ? null : 'p.ch', 'cham', x, y + i * (h + gap), w, h, 'Earn 20 Score   ▬▬▭▭▭   ★', { c: 'k', fs: 15 }));
  return {
    A: [...RUN(), E(null, 'dim', 0, 0, 1280, 720, '', { op: 0.55 }), E(null, 'cham', 440, 140, 400, 280), E('p.title', 'text', 440, 152, 400, 44, 'PAUSED', { fs: 30 }), ...btns(470, 214, 76, 10, 4), E('p.resume', 'cham', 530, 330, 220, 60, 'RESUME', { fs: 20 }), ...chs(390, 450, 500, 48, 10)],
    B: [...RUN(), E(null, 'dim', 0, 0, 1280, 720, '', { op: 0.55 }), E(null, 'cham', 80, 120, 420, 480), E('p.title', 'text', 80, 136, 420, 50, 'PAUSED', { fs: 34 }), ...btns(150, 210, 120, 40, 2), E('p.resume', 'cham', 150, 500, 280, 64, 'RESUME', { fs: 22 }), E(null, 'text', 560, 150, 640, 30, '', {}), ...chs(560, 200, 660, 80, 20)],
    C: [...RUN(), E(null, 'dim', 0, 0, 1280, 720, '', { op: 0.55 }), E('p.title', 'text', 40, 40, 400, 60, 'PAUSED', { fs: 40, al: 'l' }), ...btns(60, 130, 110, 22, 1).map((e) => e), ...chs(300, 180, 760, 76, 18), E('p.resume', 'cham', 500, 560, 360, 80, 'RESUME', { c: 'a', fs: 26 })],
  }[c];
};
L['17'] = (c) => {
  const run = [...RUN(), E('tu.block', 'state', 0, 0, 1280, 720, ''), E('tu.focus', 'state', 240, 330, 200, 140, 'vùng sáng'), E('tu.hand', 'ghost', 330, 420, 80, 90, '👆')];
  return {
    A: [...run, E('tu.text', 'text', 340, 170, 600, 50, 'Hold to Accelerate!', { fs: 30 }), E('tu.tap', 'text', 520, 222, 240, 24, 'Tap to Continue', { fs: 15, thin: true }), E('tu.image', 'state', 1000, 180, 240, 140, 'ảnh minh hoạ')],
    B: [...run, E(null, 'cham', 40, 100, 440, 150), E('tu.text', 'text', 60, 112, 400, 80, 'Hold to Accelerate!', { fs: 28 }), E('tu.tap', 'text', 60, 200, 400, 30, 'Tap to Continue', { fs: 15, thin: true }), E('tu.image', 'state', 520, 100, 260, 150, 'ảnh minh hoạ')],
    C: [...run, E(null, 'cham', 290, 560, 700, 120), E('tu.text', 'text', 290, 570, 700, 60, 'Hold to Accelerate!', { fs: 32 }), E('tu.tap', 'text', 290, 632, 700, 30, 'Tap to Continue', { fs: 15, thin: true }), E('tu.image', 'state', 490, 380, 300, 160, 'ảnh minh hoạ')],
  }[c];
};
L['18'] = (c) => {
  const rb = E('rv.rubybar', 'pill', 1060, 16, 200, 34, '⬢ 250', { fs: 16 });
  return {
    A: [...RUN(), E(null, 'dim', 0, 0, 1280, 720, '', { op: 0.45 }), rb, E(null, 'cham', 490, 130, 300, 340), E('rv.skip', 'hex', 760, 112, 52, 46, '✕', { fs: 20 }), E('rv.timer', 'hex', 580, 146, 120, 100, '♥ 6', { fs: 30 }), E('rv.title', 'text', 490, 252, 300, 44, 'REVIVE?', { fs: 30 }), E('rv.ad', 'cham', 520, 310, 240, 60, '📺 CONTINUE', { c: 'y', fs: 18 }), E('rv.ruby', 'cham', 560, 384, 160, 50, '⬢ 5', { fs: 18 }), E('rv.trigger', 'state', 390, 490, 500, 60, 'Almost new high score!  88 / 88')],
    B: [...RUN(), E(null, 'dim', 0, 0, 1280, 720, '', { op: 0.45 }), rb, E(null, 'cham', 900, 120, 340, 400), E('rv.skip', 'hex', 1206, 104, 52, 46, '✕', { fs: 20 }), E('rv.title', 'text', 900, 134, 340, 44, 'REVIVE?', { fs: 30 }), E('rv.timer', 'hex', 1000, 190, 140, 118, '♥ 6', { fs: 32 }), E('rv.ad', 'cham', 930, 330, 280, 64, '📺 CONTINUE', { c: 'y', fs: 18 }), E('rv.ruby', 'cham', 930, 410, 280, 56, '⬢ 5', { fs: 18 }), E('rv.trigger', 'state', 60, 280, 500, 80, 'Almost new high score!  88 / 88')],
    C: [...RUN(), E(null, 'dim', 0, 0, 1280, 720, '', { op: 0.35 }), rb, E(null, 'cham', 0, 520, 1280, 200), E('rv.timer', 'hex', 40, 548, 160, 136, '♥ 6', { fs: 34 }), E('rv.title', 'text', 220, 570, 300, 60, 'REVIVE?', { fs: 34, al: 'l' }), E('rv.ad', 'cham', 620, 580, 280, 70, '📺 CONTINUE', { c: 'y', fs: 20 }), E('rv.ruby', 'cham', 920, 580, 200, 70, '⬢ 5', { fs: 20 }), E('rv.skip', 'hex', 1150, 580, 90, 72, '✕', { fs: 26 }), E('rv.trigger', 'state', 390, 430, 500, 60, 'Almost new high score!  88 / 88')],
  }[c];
};

const CONCEPTS = {
  A: ['Khung giữa', 'Mọi popup và màn phụ là một khung vát góc đặt giữa màn, Home mờ phía sau; trang Shop / Garage giữ top bar + thanh tab. Gần bản gốc nhất, dễ đọc trên điện thoại ngang. Nút đóng lục giác ở cạnh trên phải (popup) hoặc giữa đáy (màn lớn).'],
  B: ['Bảng bên phải', 'Màn phụ trượt vào thành một bảng cao bên phải, nửa trái vẫn thấy xe trên bệ (Home ít bị che). Popup nhỏ (Settings, Claim Bonus, Revive) cũng nằm bên phải; Reward Track chạy ngang; Shop xếp các mục thành cột cạnh nhau.'],
  C: ['Hai cột', 'Tận dụng màn rộng: cột trái là tiêu đề / tóm tắt / nút điều hướng, cột phải là nội dung (lưới level 4×2, 3 challenge cạnh nhau, 3 nhóm thống kê). Popup xác nhận dạng dải ngang dưới đáy; HUD gom vào một dải trên cùng.'],
};
const ORDER = ['02', '04', '04b', '05', '06', '07', '08', '09', '09b', '10', '11', '11b', '12', '13', '14', '14b', '15', '16', '17', '18'];
const ON_REQUEST = new Set(Object.entries(INV['03'][1]).filter(([, v]) => v[3] === 'req').map(([k]) => k));

function check(sid, els) {
  const want = Object.keys(INV[sid][1]);
  const have = new Set(els.map((e) => e.id).filter(Boolean));
  const missing = want.filter((k) => !have.has(k));
  const extra = [...have].filter((k) => !want.includes(k));
  return missing.length || extra.length
    ? `<div class="check bad">✗ ${missing.length ? 'Thiếu: ' + missing.join(', ') : ''} ${extra.length ? 'Thừa: ' + extra.join(', ') : ''}</div>`
    : `<div class="check ok">✓ Đủ ${want.length}/${want.length} phần tử của bảng kiểm kê, không thêm phần tử mới.</div>`;
}
function posTable(sid, els) {
  const inv = INV[sid][1];
  const rows = els.filter((e) => e.id && inv[e.id]).map((e) => `<tr><td>${inv[e.id][0]}${ON_REQUEST.has(e.id) ? '<span class="tag">added on request</span>' : ''}${e.s === 'state' ? ' <span class="tag">trạng thái</span>' : ''}</td><td><code>${inv[e.id][1]}</code></td><td>${e.x}, ${e.y}</td><td>${e.w}×${e.h}</td></tr>`).join('');
  return `<details><summary>Bảng phần tử → vị trí mới (toạ độ design 1280×720)</summary><div class="wrap"><table><tr><th>Phần tử</th><th>Object gốc</th><th>x, y</th><th>w×h</th></tr>${rows}</table></div></details>`;
}

