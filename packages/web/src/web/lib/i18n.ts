// ─── Central i18n ─────────────────────────────────────────────────────────────
export type Lang = 'uk' | 'en';

export function getLang(): Lang {
  return (localStorage.getItem('platform_lang') as Lang) ?? 'uk';
}

export const T = {
  uk: {
    // common
    loading: 'Завантаження...',
    error: 'Помилка',
    accessError: 'Помилка доступу',
    noData: 'Немає даних',
    delete: 'Видалити',
    deleteConfirm: 'Видалити?',
    yes: 'Так',
    no: 'Ні',
    save: 'Зберегти',
    saving: 'Зберігається...',
    savedAuto: 'Зберігається автоматично',
    cancel: 'Скасувати',
    close: 'Закрити',
    back: '← Назад',
    next: 'Далі →',
    add: 'Додати',
    edit: 'Редагувати',
    search: 'Пошук',
    noUsers: 'Немає юзерів',

    // dashboard
    weekChange: 'Week change',
    tradesCount: (n: number) => `${n} угод`,

    // mc-simulation
    mcSimulations: '1000 симуляцій',
    mcBtTrades: (n: number) => `${n} BT угод`,
    mcLvTrades: (n: number) => `${n} Live угод`,
    mcFilterActive: '· фільтр активний',
    mcResetFilter: 'Скинути фільтр',
    mcBtSelect: 'Backtest — вибір даних',
    mcLvSelect: 'Live — вибір даних',
    mcMedian: 'Медіана (p50)',
    mcP5: 'p5 (нижня)',
    mcP95: 'p95 (верхня)',
    mcProfitProb: 'Ймов. прибутку',
    mcRuinProb: 'Ймов. руїни',
    mcLiveVsMedian: 'Live vs медіана',
    mcLiveInBand: 'Live в p5–p95',
    mcLiveInBandYes: 'Так ✓',
    mcLiveInBandNo: 'Ні ✗',
    mcEquityPaths: 'Equity paths (100 з 1000)',
    mcAsset: 'Актив',
    mcHowToRead: 'Як читати',
    mcHowToReadBootstrap: '— кожна симуляція випадково тягне угоди з вибраних бектестів і будує equity curve.',
    mcHowToReadBand: '— 90% симуляцій між цими лініями. Live нижче p5 — сигнал.',
    mcHowToReadLive: 'будується на вибраних live угодах.',

    // charts
    chartsExplanation: 'Пояснення',
    chartsDeviation: 'Поточне відхилення',
    chartsLiveLast: 'Live (останнє)',
    chartsVsBt: 'vs Бектест',
    chartsVsMc: 'vs Очікуване (MC)',
    chartsMcBand: 'MC p5–p95',
    chartsExpRange: 'Очікуваний діапазон',
    chartsInNorm: 'У межах норми',
    chartsBelowP5: 'Нижче p5 — увага!',
    chartsAboveP95: 'Вище p95 — увага!',
    chartsNoData: 'Немає даних',
    chartsModels: 'Що моделює',
    chartsScenario: 'Сценарій',
    chartsHowWorks: 'Як працює',
    chartsImpact: 'Вплив',

    // admin-users
    adminAutoSave: 'Зберігається автоматично',
    adminYou: 'ТИ',

    // live-trades / backtest-trades
    deleteQuestion: 'Видалити?',

    // subscription
    subLoading: 'Завантаження налаштувань...',
    subCurrentStatus: 'Ваш поточний статус:',
    subUpdated: (dt: string) => `(оновлено ${dt})`,
    subSaved: 'Налаштування збережено',
    subSaveError: 'Помилка збереження',
    subLoadError: 'Помилка завантаження',
    subNoRights: 'Немає прав для редагування',
    subSaveFailed: 'Не вдалося зберегти',
    subLoadFailed: 'Не вдалося отримати налаштування',

    // subscription feature descriptions
    subFeatureDashboard: 'Загальний огляд лайв і бектест перформансу: еквіті, статистика, новини ринку та тижневі відхилення ціни',
    subFeatureLiveDb: 'Додавай, редагуй і керуй своїми лайв угодами з усіма деталями',
    subTrialExpired: 'Trial expired — subscribe to restore access',

    // analysis
    cantCompareSameMonth: "Не можна порівнювати місяць із собою — обери два різних місяці.",

    // subscription feature descriptions (full)
    subFeatureBacktestDb: 'Зберігай і аналізуй історію своїх бектест угод',
    subFeatureLiveAnalysis: 'Еквіті крива, розподіл PnL, розподіл R на угоду, консістенсі скор, сесії, вінрейт, вінстрік / лузстрік, порівняння місяців',
    subFeatureBtAnalysis: 'Еквіті крива, розподіл PnL, розподіл R на угоду, консістенсі скор, сесії, вінрейт, вінстрік / лузстрік, порівняння місяців і років, аналіз по різних активах і датасетах',
    subFeatureMC: 'Порівняння еквіті Net R vs Gross R (бектест і лайв), вінрейт, avg RR, профіт фактор, макс дродаун, Std Dev, SQN, 9 стрес-метрик, Survival Rate і Monte Carlo симуляції',
    subFeatureCOT: 'Щотижнева звітність яку публікує CFTC (Commodity Futures Trading Commission) — позиції великих гравців для макро конфлюенсу',
    subPlansModalSaveError: 'Помилка збереження планів',

    // charts — equity deviation status
    chartsInNormYellow: 'В нормі',
    chartsBelowNorm: 'Нижче норми',
    chartsAboveNorm: 'Вище норми',
    chartsAboveNormCrit: 'Вище норми !!!',
    chartsBelowNormCrit: 'Нижче норми !!!',
    chartsAboveNormPlus: 'Підвищений',

    // charts — MC/stress labels
    chartsBtColor: 'Бектест',
    chartsLiveColor: 'Live (синій)',
    chartsMcMedianColor: 'MC median (білий)',
    chartsMcBandColor: 'MC p5/p95 (помаранчевий)',
    chartsNormalized: 'Нормалізований',
    chartsCumulative: 'Кумулятивний',
    chartsNormalizedDesc: 'Y = накопичений R ÷ кількість угод до цієї точки. Криві близько = однаковий темп зростання.',
    chartsNoBtData: 'Немає даних бектесту.',
    chartsDeviationLabel: 'Відхилення',
    chartsMetricLabel: 'Метрика',
    chartsBtLabel: 'Бектест',
    chartsMcExpected: 'MC Очікуване',
    chartsSimCount: (n: string, h: number, c: string) => `${n} симуляцій · горизонт ${h} угод · trade cost ${c}R/угода`,
    chartsSimCountAvg: ' (avg з BT)',
    chartsSimCountCustom: ' (власний)',
    chartsSimResults: 'Результати симуляції',
    chartsSimExpected: 'Очікуваний результат (медіана)',
    chartsSimWorst: 'Гірший сценарій (p5)',
    chartsSimBest: 'Кращий сценарій (p95)',
    chartsMcExamples: (n: number) => `${n} прикладів симуляцій`,
    chartsMcMedianLine: 'Медіана',
    chartsFactorImpact: 'Вплив стрес-факторів',
    chartsFactorsZero: 'Всі фактори = 0',
    chartsFactorsInactive: 'Стрес-фактори неактивні',
    chartsKeyMetrics: 'Ключові метрики',
    chartsMcMedianShort: 'MC медіана',
    chartsSimMedianShort: 'медіана',
    chartsSimWorstShort: 'p5 (гірший)',
    chartsBlownProb: 'ймовірність blown account',
    chartsSimCount2: (n: string, ddP5: string) => `мед=${n}R · p5 (гірший) = ${ddP5}R`,
    chartsSimulations: (n: string) => `Симуляцій`,
    chartsBtSelectLabel: 'Backtest — вибір даних',
    chartsLvSelectLabel: 'Live — вибір даних',
    chartsNSimLabel: 'N симуляцій',
    chartsNSimDefault: 'за замовч. 5000',
    chartsHorizonLabel: 'Горизонт (угод)',
    chartsHorizonDefault: 'відповідає к-сті BT',
    chartsTradeCostLabel: 'Trade cost (R/угода)',
    chartsTradeCostDefault: "від'ємне = cost",
    chartsStdDevLabel: 'Std Dev формула',
    chartsStdDevSample: 'вибірка / <100 угод',
    chartsStdDevPop: 'генеральна / >100',
    chartsJitterDefault: '0 = вимкнено · 0.15 = ±15% std шум · збільшує розкид при малих датасетах',
    chartsLossFactors: 'Фактори збитків',
    chartsExtraFactors: 'Додаткові фактори',
    chartsResetStress: 'Скинути стрес',
    chartsSaveCombo: 'Зберегти комбінацію',
    chartsSavedCombos: (n: number) => `Збережені (${n})`,
    chartsSaveComboTitle: 'Зберегти комбінацію факторів',
    chartsSaveComboPlaceholder: 'Назва...',
    chartsSaveComboBtn: '✓ Зберегти',
    chartsApply: 'Застосувати',
    chartsComboDefault: 'всі за замовчуванням',

    // charts — jitter explain block (lines 1883-1886)
    chartsJitterModelsText: 'Природну мінливість розміру трейдів — spread, re-quote, різниця між бектест-ціною і реальним виконанням.',
    chartsJitterScenarioText: 'Ринок рухається на тебе під час виконання — ти отримуєш трейд, але з іншим RR ніж у бектесті.',
    chartsJitterHowText: 'До кожного семплованого трейду додається нормальний шум N(0, std × jitter). При jitter=0.15 це ±15% від стандартного відхилення вибірки.',
    chartsJitterImpactText: 'Розширює розкид кривих при малих датасетах. Корисно коли вибірка <100 трейдів — без jitter криві виглядають штучно рівними.',

    // charts — StressSlider descriptions
    chartsSliderSurvivalDesc: 'Просадка понад цей поріг = blown account. Впливає на Survival Rate.',
    chartsSliderLossAmpDesc: 'Збільшити розмір кожного збитку. 1.0 = без змін, 1.2 = збитки на 20% більші',
    chartsSliderWinRedDesc: 'Зменшити розмір кожного виграшу. 1.0 = без змін, 0.8 = виграші на 20% менші',
    chartsSliderWrDegDesc: 'Конвертувати % випадкових TP в SL. 0.1 = 10% виграшів стають програшами',
    chartsSliderSlipDesc: 'Додатковий cost per trade в R (окремо від Trade cost). 0.05 = −0.05R',
    chartsSliderHumanErrDesc: 'Тильт, забув стоп. З ймовірністю X% трейд стає −1R незалежно від результату',
    chartsSliderFatigueDesc: 'Злякався відкату, вийшов раніше. Кожен прибутковий трейд зменшується на X%',
    chartsSliderBadSlipProbDesc: 'Ймовірність що стоп спрацює по гіршій ціні (гепи, новини)',
    chartsSliderBadSlipMultDesc: 'Сила удару при поганому виконанні. 1.4× = збиток −1R стає −1.4R',
    chartsSliderMissedWinDesc: 'Пропустив прибуткову угоду. Прибуток стає 0R',
    chartsSliderFatigueFormat: (v: number) => `−${(v * 100).toFixed(0)}% від виграшу`,

    // charts — StressSlider explain texts
    chartsExplainSurvivalModels: 'Максимально допустиму просадку рахунку — поріг після якого стратегія вважається провалена.',
    chartsExplainSurvivalScenario: 'Ти поставив правило: якщо просадка перевищить X R — зупиняєш торгівлю. Цей параметр симулює скільки симуляцій досягають цього порогу.',
    chartsExplainSurvivalHow: 'В кожній MC симуляції відстежується максимальна просадка. Якщо вона перевищує threshold — симуляція рахується як "blown". Survival Rate = % симуляцій що вижили.',
    chartsExplainSurvivalImpact: 'Зменшення порогу різко знижує Survival Rate. При 5R порозі і лосс-стріку 3-4 трейди ти майже гарантовано "підриваєшся". Реалістичний поріг — 10-20R.',

    chartsExplainLossAmpModels: 'Систематичне збільшення реальних збитків відносно бектесту — ширший спред, гірше виконання стопів, новинні гепи.',
    chartsExplainLossAmpScenario: 'Ти торгуєш бектест з SL=1R, але на реальному ринку стопи спрацьовують по 1.2R через слип та гепи під час волатильності.',
    chartsExplainLossAmpHow: 'Кожен збитковий трейд у симуляції множиться на цей коефіцієнт. 1.2× означає що -1R стає -1.2R для кожного програшу.',
    chartsExplainLossAmpImpact: 'Прямо впливає на Total R та Max DD. При ×1.3 і WR 50% система може стати збитковою. Найбільш реалістичний діапазон для активного трейдингу: 1.05–1.2.',

    chartsExplainWinRedModels: 'Ранній вихід з прибуткових угод — ти закрив раніше цілі через страх розвороту або зменшив TP.',
    chartsExplainWinRedScenario: 'Бектест показує середній виграш 2R, але в реальності ти виходиш по 1.6R через психологічний тиск або часткові виходи.',
    chartsExplainWinRedHow: 'Кожен прибутковий трейд у симуляції множиться на цей коефіцієнт. 0.8× означає що +2R стає +1.6R.',
    chartsExplainWinRedImpact: "Знижує середнє очікування (EV) та SQN. При 0.7× навіть система з WR 60% може мати від'ємне EV. Комбінація з Loss Amplification — найжорсткіший стрес-тест.",

    chartsExplainWrDegModels: 'Деградацію win rate — ринок змінився, сетап відпрацьовує гірше, або фільтрація входів погіршилась.',
    chartsExplainWrDegScenario: 'Бектест показав WR 55%, але через зміну режиму ринку або overtrade 10% виграшів перетворилися на програші.',
    chartsExplainWrDegHow: 'Рандомно вибрані X% виграшів конвертуються в збитки (TP → SL). Це знижує реальний WR пропорційно значенню параметра.',
    chartsExplainWrDegImpact: 'Найсильніший вплив на системи з низьким RR. При WR 50% і degradation 0.15 реальний WR стає ~42.5% — більшість систем з RR 1:1 стають збитковими.',

    chartsExplainSlipModels: 'Систематичний сліпаж при виконанні — різниця між очікуваною і реальною ціною входу/виходу.',
    chartsExplainSlipScenario: 'Ти торгуєш на відкритті свічки, але реально отримуєш ціну на 0.05R гірше через затримку ордера або недостатню ліквідність.',
    chartsExplainSlipHow: "До кожного трейду (і виграшу і програшу) додається фіксований від'ємний cost у R. Окремо від Trade Cost — моделює ринковий сліпаж а не комісію.",
    chartsExplainSlipImpact: 'При 100 трейдах і slippage 0.05R це -5R на рік лише від сліпажу. Малий вплив на окремий трейд, але суттєвий на великій вибірці.',

    chartsExplainHumanErrModels: 'Психологічні помилки — тильт, порушення правил, ігнорування стопів під впливом емоцій.',
    chartsExplainHumanErrScenario: 'Після серії програшів ти не виставив стоп або переніс його далі. Один раз на 20 трейдів ти отримуєш катастрофічний збиток замість розрахункового.',
    chartsExplainHumanErrHow: "З ймовірністю X% будь-який трейд (і виграшний і програшний) замінюється на фіксований -1R — незалежно від оригінального результату.",
    chartsExplainHumanErrImpact: 'Навіть 2% помилок помітно псують SQN та збільшують Max DD. При 5% частота катастрофічних трейдів стає системною проблемою — система втрачає edge.',

    chartsExplainFatigueModels: 'Накопичену втому від торгівлі — зменшення якості утримання позицій після тривалих сесій або серій трейдів.',
    chartsExplainFatigueScenario: 'До кінця дня або після 5+ трейдів ти виходиш раніше цілі. Виграшний трейд 2R закривається по 1.4R через психологічну втому.',
    chartsExplainFatigueHow: 'Кожен прибутковий трейд зменшується на X% від свого значення. 20% decay перетворює +2R на +1.6R на кожному виграші.',
    chartsExplainFatigueImpact: "Поступово \"з'їдає\" EV системи. Комбінується з Win Reduction — разом моделюють загальну деградацію утримання прибутків.",

    chartsExplainBadSlipProbModels: 'Ймовірність екстремального сліпажу при виконанні стопу — геп на відкритті, новини, flash crash.',
    chartsExplainBadSlipProbScenario: 'Ти тримаєш позицію через ніч. Ціна гепує повз твій стоп і ти виходиш по набагато гіршій ціні ніж планував.',
    chartsExplainBadSlipProbHow: 'З ймовірністю X% збитковий трейд додатково множиться на Bad Slip Multiplier. Два параметри працюють разом.',
    chartsExplainBadSlipProbImpact: "Самостійно майже не впливає — тільки в парі з Bad Slip Mult. При 20% prob і 2× mult кожен п'ятий програш стає вдвічі більшим.",

    chartsExplainBadSlipMultModels: 'Розмір збитку при спрацюванні поганого виконання (в парі з Bad Slip Prob).',
    chartsExplainBadSlipMultScenario: 'Геп через новини — стоп на -1R але реальний вихід по -2.5R. Ринок пройшов ліквідність і пішов далі перед розворотом.',
    chartsExplainBadSlipMultHow: 'Коли спрацьовує Bad Slip Prob, збиток множиться на цей коефіцієнт. 2.0× при -1R дає -2R фактичного збитку.',
    chartsExplainBadSlipMultImpact: 'Критично впливає на Max DD при комбінації з високим Prob. ×3 навіть при 10% prob може зруйнувати Survival Rate.',

    chartsExplainMissedWinModels: "Пропущені прибуткові можливості — не встиг увійти, відволікся, вже в позиції, вирішив пропустити сетап.",
    chartsExplainMissedWinScenario: 'Сетап спрацював поки ти спав або був зайнятий. 15% сетапів ти просто не берешь — вони відпрацьовують без тебе.',
    chartsExplainMissedWinHow: 'X% випадково вибраних виграшних трейдів замінюються на 0R — ніби ти не увійшов. Збиткові трейди залишаються незмінними.',
    chartsExplainMissedWinImpact: 'Асиметрично погіршує результат — ти пропускаєш виграші але не пропускаєш програші. Знижує WR та Total R. 15% missed wins ≈ -15% від загального профіту.',
    chartsGoToSettings: 'Перейти до налаштування',
    chartsSimsUnit: (n: string) => `${n} сим`,
    chartsHorizonUnit: (h: string) => `горизонт ${h}`,
    chartsSimError: (msg: string) => `Помилка: ${msg}`,
    chartsMcRunError: 'Помилка симуляції',
    chartsUnnamedCombo: 'Без назви',
    chartsResetFilter: 'Скинути фільтр',
    chartsFilterActive: '· фільтр активний',
    chartsActiv: 'Актив',

    // charts — SCF block labels
    chartsEqInNorm: 'В нормі',
    chartsEqBelowNorm: 'Нижче норми',
    chartsEqBelowNormCrit: 'Нижче норми !!!',
    chartsDdAboveNormCrit: 'Вище норми !!!',
    chartsDdAboveNorm: 'Вище норми',
    chartsDdBelowNorm: 'Нижче норми',
    chartsDdInNorm: 'В нормі',
    chartsSqnBelowNorm: 'Нижче норми',
    chartsSqnInNormYellow: 'В нормі',
    chartsSqnInNorm: 'В нормі',
    chartsSqnAboveNorm: 'Вище норми',
    chartsWrBelowNormCrit: 'Нижче норми !!!',
    chartsWrBelowNorm: 'Нижче норми',
    chartsWrInNorm: 'В нормі',
    chartsStrkAboveNormCrit: 'Вище норми !!!',
    chartsStrkAboveNorm: 'Підвищений',
    chartsStrkInNorm: 'В нормі',
    chartsPfBelowNormCrit: 'Нижче норми !!!',
    chartsPfBelowMedian: 'Нижче медіани',
    chartsPfInNorm: 'В нормі',

    // charts — SCF accordion labels
    chartsScfEqProfit: 'Exp. Med. Profit — фактори які впливали',
    chartsScfEqLoss: 'Exp. Med. Loss — фактори які впливали',
    chartsScfDdMed: 'Med. DD — фактори які впливали',
    chartsScfSqnMed: 'Med. SQN — фактори які впливали',
    chartsScfWrMed: 'Med. WR — фактори які впливали',
    chartsScfStrk: 'Losing Streak — фактори які впливали',
    chartsScfPf: 'Profit Factor — фактори які впливали',
    chartsMedianaShort: 'Медіана',

    // charts — deviation table
    chartsDevFromMedProfit: 'Dev. від med. profit',
    chartsBtDevFromMedProfit: 'BT dev. від med. profit',

    // charts — equity view mode
    chartsEquityCurves: (mode: string) => `Equity Curves — ${mode}`,
    chartsEquityGrowthRate: 'Середнє R/угоду (темп зростання)',

    // charts — rolling analysis lines (long analytical texts)
    chartsRollingWrDesc: 'Відсоток виграшних угод у ковзному вікні (BT=20 трейдів, Live=10).\n',
    chartsRollingWrBelowP5: (lv: string, p5: string) => `⚠️ WR (${lv}%) вийшов нижче p5 (${p5}%) — сигнал тривоги. Стратегія деградує або ринковий режим змінився.`,
    chartsRollingWrAboveP95: (lv: string, p95: string) => `WR (${lv}%) вище p95 (${p95}%) — незвично добре. Можливо короткострокова серія удачі, стежте за стабільністю.`,
    chartsRollingWrBelowMed: (lv: string, med: string) => `WR (${lv}%) помітно нижче MC медіани (${med}%), але ще в межах p5–p95. Тенденція до зниження — варто спостерігати.`,
    chartsRollingWrNearMed: (lv: string, med: string) => `WR (${lv}%) близький до MC медіани (${med}%) і в межах норми p5–p95. Стратегія виконується відповідно до очікувань.`,
    chartsRollingWrAboveMed: (lv: string, med: string) => `WR (${lv}%) вище MC медіани (${med}%) і в межах норми. Хороший результат.`,
    chartsRollingWrBtBehind: (dev: string, bt: string) => `Відставання від бектесту: −${dev}pp. Бектест WR ${bt}% — Live не досягає цього рівня.`,
    chartsRollingWrBtAhead: (dev: string, bt: string) => `Live WR перевищує бектест на +${dev}pp (BT ${bt}%). Можливо сприятлива ринкова фаза.`,
    chartsRollingWrBtMatch: (lv: string, bt: string) => `Live WR (${lv}%) відповідає бектесту (${bt}%) — відхилення незначне.`,
    chartsRollingWrConclusionCrit: '\nВисновок: стратегія під тиском. Якщо WR не відновиться протягом наступних 10–15 угод — розгляньте паузу для аналізу.',
    chartsRollingWrConclusionWarn: '\nВисновок: WR знизився відносно бектесту і MC очікування, але ще не вийшов за межі допустимого коридору. Якщо крива пробʼє p5 — це сигнал тривоги.',
    chartsRollingWrConclusionOk: '\nВисновок: WR в нормальному діапазоні, стратегія працює відповідно до очікувань.',

    chartsRollingRrDesc: 'Середнє співвідношення ризик/прибуток за ковзним вікном (BT=20, Live=10).\n',
    chartsRollingRrBelowP5: (lv: string, p5: string) => `⚠️ Avg RR (${lv}) нижче p5 (${p5}) — якість виконання угод критично знизилась. Перевірте дисципліну виходів.`,
    chartsRollingRrAboveP95: (lv: string, p95: string) => `Avg RR (${lv}) вище p95 (${p95}) — незвично високий. Можлива серія виняткових угод.`,
    chartsRollingRrBelowMed: (lv: string, med: string) => `Avg RR (${lv}) помітно нижче MC медіани (${med}), але ще в межах p5–p95. Якість входів знижується — стежте.`,
    chartsRollingRrNearMed: (lv: string, med: string) => `Avg RR (${lv}) близький до MC медіани (${med}) — якість виконання в нормі.`,
    chartsRollingRrAboveMed: (lv: string, med: string) => `Avg RR (${lv}) вище MC медіани (${med}) — відмінна якість угод у поточному вікні.`,
    chartsRollingRrBtBehind: (dev: string, bt: string) => `Відставання від бектесту: ${dev}%. BT Avg RR ${bt} — Live не досягає очікуваного рівня.`,
    chartsRollingRrBtAhead: (dev: string, bt: string) => `Live Avg RR перевищує бектест на +${dev}% (BT ${bt}).`,
    chartsRollingRrBtMatch: (lv: string, bt: string) => `Live Avg RR (${lv}) відповідає бектесту (${bt}) — відхилення незначне.`,
    chartsRollingRrConclusionCrit: '\nВисновок: якість виконання угод під серйозним тиском. Проаналізуйте останні угоди — можливо змінилась дисципліна виходу або якість сетапів.',
    chartsRollingRrConclusionWarn: '\nВисновок: Avg RR знизився відносно очікувань, але ще в допустимому коридорі. Продовжуйте спостереження.',
    chartsRollingRrConclusionOk: '\nВисновок: Avg RR в нормальному діапазоні, якість виконання угод відповідає бектесту.',

    chartsRollingPfDesc: 'Profit Factor = Сума виграшів / Сума програшів у ковзному вікні (BT=20, Live=10). PF > 1 — прибутковість.\n',
    chartsRollingPfBelowP5: (lv: string, p5: string) => `⚠️ PF (${lv}) нижче p5 (${p5}) — стратегія збиткова і виходить за межі допустимого. Серйозний сигнал.`,
    chartsRollingPfAboveP95: (lv: string, p95: string) => `PF (${lv}) вище p95 (${p95}) — незвично висока прибутковість у вікні. Можлива серія.`,
    chartsRollingPfBelowMed: (lv: string, med: string) => `PF (${lv}) помітно нижче MC медіани (${med}), але ще в межах норми p5–p95. Тенденція до зниження.`,
    chartsRollingPfNearMed: (lv: string, med: string) => `PF (${lv}) близький до MC медіани (${med}) — прибутковість відповідає очікуванням.`,
    chartsRollingPfAboveMed: (lv: string, med: string) => `PF (${lv}) вище MC медіани (${med}) — прибутковість краща за очікувану.`,
    chartsRollingPfBtBehind: (dev: string, bt: string) => `PF відстає від бектесту на ${dev}% (BT ${bt}). Live менш прибутковий ніж в бектесті.`,
    chartsRollingPfBtAhead: (dev: string, bt: string) => `Live PF перевищує бектест на +${dev}% (BT ${bt}).`,
    chartsRollingPfBtMatch: (lv: string, bt: string) => `Live PF (${lv}) відповідає бектесту (${bt}) — відхилення незначне.`,
    chartsRollingPfConclusionCrit: '\nВисновок: стратегія збиткова в поточному вікні. Якщо PF не відновиться — розгляньте паузу для аналізу.',
    chartsRollingPfConclusionCrit2: '\nВисновок: PF критично низький. Перегляньте управління виходами та якість сетапів.',
    chartsRollingPfConclusionWarn: '\nВисновок: PF нижче очікуваного, але ще в нормі. Продовжуйте спостереження, не змінюйте стратегію.',
    chartsRollingPfConclusionOk: '\nВисновок: Profit Factor в нормальному діапазоні, стратегія прибуткова відповідно до очікувань.',

    chartsRollingDdDesc: 'Максимальна просадка (в R) від піку до дна у ковзному вікні (BT=20, Live=10). Менше = краще.\n',
    chartsRollingDdAboveP95: (lv: string, p95: string) => `⚠️ Max DD (${lv}R) перевищує p95 (${p95}R) — просадка виходить за межі очікуваної. Підвищений ризик.`,
    chartsRollingDdBelowP5: (lv: string, p5: string) => `Max DD (${lv}R) дуже низький (нижче p5 ${p5}R) — незвично мала просадка. Можлива серія вдалих угод.`,
    chartsRollingDdAboveMed: (lv: string, med: string) => `Max DD (${lv}R) помітно вищий за MC медіану (${med}R), але ще в межах p5–p95. Просадка зростає — стежте.`,
    chartsRollingDdNearMed: (lv: string, med: string) => `Max DD (${lv}R) близький до MC медіани (${med}R) — просадка в межах норми.`,
    chartsRollingDdBelowMed: (lv: string, med: string) => `Max DD (${lv}R) нижчий за MC медіану (${med}R) — контроль ризику краще очікуваного.`,
    chartsRollingDdBtHigher: (dev: string, bt: string) => `Live DD на +${dev}% вищий ніж в бектесті (BT ${bt}R) — Live торгівля несе більшу просадку.`,
    chartsRollingDdBtLower: (dev: string, bt: string) => `Live DD на ${dev}% нижчий ніж в бектесті (BT ${bt}R) — Live контролює ризик краще.`,
    chartsRollingDdBtMatch: (lv: string, bt: string) => `Live DD (${lv}R) відповідає бектесту (${bt}R) — відхилення незначне.`,
    chartsRollingDdConclusionCrit: '\nВисновок: просадка критична. Зменшіть розмір позицій або зробіть паузу до стабілізації.',
    chartsRollingDdConclusionWarn: '\nВисновок: просадка підвищена відносно очікувань, але ще в межах допустимого. Контролюйте ризик-менеджмент.',
    chartsRollingDdConclusionOk: '\nВисновок: Max Drawdown в нормальному діапазоні, ризик-менеджмент відповідає бектесту.',

    chartsStdDevExplanation: `Стандартне відхилення розподілу Net R у ковзному вікні. Вимірює консистентність результатів. Низьке значення = стабільні результати. Різкий ріст StdDev означає підвищену нестабільність у live-торгівлі відносно бектесту.

Як читати:
• Обидві криві рівні → Live веде себе так само консистентно як бектест
• Синя вища за сіру → Live результати хаотичніші, більший розкид R
• Синя нижча за сіру → Live стабільніший (рідко)`,

    // charts — comparison mode labels
    chartsCompModeDesc: (mode: string, cmpN: number | null) =>
      mode === 'cumulative'
        ? 'Режим: кумулятивний — порівнюються фінальні значення всіх угод.'
        : `Режим: нормалізований — порівняння по ${cmpN} угодах (коротша серія).`,
    chartsLiveNetVsBtNet: (sign: string, r: string, pct: string, type: 'close' | 'below' | 'behind' | 'ahead') => {
      if (type === 'close') return `Live Net vs BT Net: ${sign}${r}R (${sign}${pct}%) — Live близький до бектесту, відхилення в нормі.`;
      if (type === 'below') return `Live Net vs BT Net: ${sign}${r}R (${sign}${pct}%) — Live суттєво нижче бектесту. Можливі причини: зміна ринкового режиму, overfitting бектесту або деградація стратегії.`;
      if (type === 'behind') return `Live Net vs BT Net: ${sign}${r}R (${sign}${pct}%) — Live відстає від бектесту. Варто перевірити чи не змінились умови ринку.`;
      return `Live Net vs BT Net: ${sign}${r}R (${sign}${pct}%) — Live випереджає бектест. Можливо ринок зараз сприятливий для стратегії.`;
    },
    chartsGrossCheck: 'Gross відхилення менше ніж Net — комісії/слипаж підсилюють відставання Live від бектесту.',
    chartsGrossSameAsNet: (pct: string) => `Live Gross vs BT Gross: ${pct} — відхилення майже таке ж як Net. Комісії не є головною причиною проблеми.`,
    chartsLiveCostPct: (pct: string) => `Комісії Live: −${pct}% від Gross прибутку.`,
    chartsCostBtVsLiveHigher: (bt: string, lv: string) => `В бектесті комісії складали −${bt}%, в Live — −${lv}%. Live платить більше ніж закладено в бектест.`,
    chartsCostMatch: (lv: string, bt: string) => `Рівень комісій у Live (${lv}%) близький до бектесту (${bt}%).`,
    chartsCompMetrics: 'Порівняння метрик',
    chartsCompModeLabel: (cmpN: number | null) =>
      cmpN != null ? ` (по ${cmpN} уг.)` : '',
    chartsDeviationFull: (nLabel: string) => `Відхилення${nLabel}`,
    chartsMcBandHeaderBootstrap: 'Monte Carlo — Stress Simulation',
    chartsMcBootstrapDesc: 'Bootstrap + стрес-фактори · Ручний запуск',
  },
  en: {
    // common
    loading: 'Loading...',
    error: 'Error',
    accessError: 'Access error',
    noData: 'No data',
    delete: 'Delete',
    deleteConfirm: 'Delete?',
    yes: 'Yes',
    no: 'No',
    save: 'Save',
    saving: 'Saving...',
    savedAuto: 'Auto-saved',
    cancel: 'Cancel',
    close: 'Close',
    back: '← Back',
    next: 'Next →',
    add: 'Add',
    edit: 'Edit',
    search: 'Search',
    noUsers: 'No users',

    // dashboard
    weekChange: 'Week change',
    tradesCount: (n: number) => `${n} trades`,

    // mc-simulation
    mcSimulations: '1000 simulations',
    mcBtTrades: (n: number) => `${n} BT trades`,
    mcLvTrades: (n: number) => `${n} Live trades`,
    mcFilterActive: '· filter active',
    mcResetFilter: 'Reset filter',
    mcBtSelect: 'Backtest — select data',
    mcLvSelect: 'Live — select data',
    mcMedian: 'Median (p50)',
    mcP5: 'p5 (lower)',
    mcP95: 'p95 (upper)',
    mcProfitProb: 'Profit probability',
    mcRuinProb: 'Ruin probability',
    mcLiveVsMedian: 'Live vs median',
    mcLiveInBand: 'Live in p5–p95',
    mcLiveInBandYes: 'Yes ✓',
    mcLiveInBandNo: 'No ✗',
    mcEquityPaths: 'Equity paths (100 of 1000)',
    mcAsset: 'Asset',
    mcHowToRead: 'How to read',
    mcHowToReadBootstrap: '— each simulation randomly draws trades from selected backtests and builds an equity curve.',
    mcHowToReadBand: '— 90% of simulations fall between these lines. Live below p5 is a signal.',
    mcHowToReadLive: 'is built from selected live trades.',

    // charts
    chartsExplanation: 'Explanation',
    chartsDeviation: 'Current deviation',
    chartsLiveLast: 'Live (last)',
    chartsVsBt: 'vs Backtest',
    chartsVsMc: 'vs Expected (MC)',
    chartsMcBand: 'MC p5–p95',
    chartsExpRange: 'Expected range',
    chartsInNorm: 'Within normal range',
    chartsBelowP5: 'Below p5 — warning!',
    chartsAboveP95: 'Above p95 — warning!',
    chartsNoData: 'No data',
    chartsModels: 'What it models',
    chartsScenario: 'Scenario',
    chartsHowWorks: 'How it works',
    chartsImpact: 'Impact',

    // admin-users
    adminAutoSave: 'Auto-saved',
    adminYou: 'YOU',

    // live-trades / backtest-trades
    deleteQuestion: 'Delete?',

    // subscription
    subLoading: 'Loading settings...',
    subCurrentStatus: 'Your current status:',
    subUpdated: (dt: string) => `(updated ${dt})`,
    subSaved: 'Settings saved',
    subSaveError: 'Save error',
    subLoadError: 'Load error',
    subNoRights: 'No permission to edit',
    subSaveFailed: 'Failed to save',
    subLoadFailed: 'Failed to load settings',

    // subscription feature descriptions
    subFeatureDashboard: 'General overview of live and backtest performance: equity, stats, market news and weekly price deviations',
    subFeatureLiveDb: 'Add, edit and manage your live trades with all details',
    subTrialExpired: 'Trial expired — subscribe to restore access',

    // analysis
    cantCompareSameMonth: "Can't compare a month to itself — pick two different months.",

    // subscription feature descriptions (full)
    subFeatureBacktestDb: 'Store and analyse your backtest trade history',
    subFeatureLiveAnalysis: 'Equity curve, PnL distribution, R per trade distribution, consistency score, sessions, win rate, win streak / lose streak, month comparison',
    subFeatureBtAnalysis: 'Equity curve, PnL distribution, R per trade distribution, consistency score, sessions, win rate, win streak / lose streak, month & year comparison, multi-asset & dataset analysis',
    subFeatureMC: 'Equity comparison Net R vs Gross R (backtest & live), win rate, avg RR, profit factor, max drawdown, Std Dev, SQN, 9 stress metrics, Survival Rate and Monte Carlo simulations',
    subFeatureCOT: 'Weekly report published by CFTC (Commodity Futures Trading Commission) — large player positions for macro confluence',
    subPlansModalSaveError: 'Failed to save plans',

    // charts — equity deviation status
    chartsInNormYellow: 'Within range',
    chartsBelowNorm: 'Below normal',
    chartsAboveNorm: 'Above normal',
    chartsAboveNormCrit: 'Above normal !!!',
    chartsBelowNormCrit: 'Below normal !!!',
    chartsAboveNormPlus: 'Elevated',

    // charts — MC/stress labels
    chartsBtColor: 'Backtest',
    chartsLiveColor: 'Live (blue)',
    chartsMcMedianColor: 'MC median (white)',
    chartsMcBandColor: 'MC p5/p95 (orange)',
    chartsNormalized: 'Normalized',
    chartsCumulative: 'Cumulative',
    chartsNormalizedDesc: 'Y = cumulative R ÷ number of trades to that point. Curves close together = same growth rate.',
    chartsNoBtData: 'No backtest data.',
    chartsDeviationLabel: 'Deviation',
    chartsMetricLabel: 'Metric',
    chartsBtLabel: 'Backtest',
    chartsMcExpected: 'MC Expected',
    chartsSimCount: (n: string, h: number, c: string) => `${n} simulations · horizon ${h} trades · trade cost ${c}R/trade`,
    chartsSimCountAvg: ' (avg from BT)',
    chartsSimCountCustom: ' (custom)',
    chartsSimResults: 'Simulation results',
    chartsSimExpected: 'Expected result (median)',
    chartsSimWorst: 'Worst case (p5)',
    chartsSimBest: 'Best case (p95)',
    chartsMcExamples: (n: number) => `${n} sample simulations`,
    chartsMcMedianLine: 'Median',
    chartsFactorImpact: 'Stress factor impact',
    chartsFactorsZero: 'All factors = 0',
    chartsFactorsInactive: 'Stress factors inactive',
    chartsKeyMetrics: 'Key metrics',
    chartsMcMedianShort: 'MC median',
    chartsSimMedianShort: 'median',
    chartsSimWorstShort: 'p5 (worst)',
    chartsBlownProb: 'probability of blown account',
    chartsSimCount2: (n: string, ddP5: string) => `med=${n}R · p5 (worst) = ${ddP5}R`,
    chartsSimulations: (n: string) => `Simulations`,
    chartsBtSelectLabel: 'Backtest — select data',
    chartsLvSelectLabel: 'Live — select data',
    chartsNSimLabel: 'N simulations',
    chartsNSimDefault: 'default 5000',
    chartsHorizonLabel: 'Horizon (trades)',
    chartsHorizonDefault: 'matches BT count',
    chartsTradeCostLabel: 'Trade cost (R/trade)',
    chartsTradeCostDefault: 'negative = cost',
    chartsStdDevLabel: 'Std Dev formula',
    chartsStdDevSample: 'sample / <100 trades',
    chartsStdDevPop: 'population / >100',
    chartsJitterDefault: '0 = off · 0.15 = ±15% std noise · increases spread on small datasets',
    chartsLossFactors: 'Loss factors',
    chartsExtraFactors: 'Additional factors',
    chartsResetStress: 'Reset stress',
    chartsSaveCombo: 'Save combination',
    chartsSavedCombos: (n: number) => `Saved (${n})`,
    chartsSaveComboTitle: 'Save factor combination',
    chartsSaveComboPlaceholder: 'Name...',
    chartsSaveComboBtn: '✓ Save',
    chartsApply: 'Apply',
    chartsComboDefault: 'all defaults',

    // charts — jitter explain block
    chartsJitterModelsText: 'Natural variability in trade size — spread, re-quote, difference between backtest price and actual execution.',
    chartsJitterScenarioText: 'Market moves against you during execution — you get the trade but with a different RR than in backtest.',
    chartsJitterHowText: 'A normal noise N(0, std × jitter) is added to each sampled trade. At jitter=0.15 this is ±15% of the sample standard deviation.',
    chartsJitterImpactText: 'Widens curve spread on small datasets. Useful when sample <100 trades — without jitter curves look artificially smooth.',

    // charts — StressSlider descriptions
    chartsSliderSurvivalDesc: 'Drawdown beyond this threshold = blown account. Affects Survival Rate.',
    chartsSliderLossAmpDesc: 'Increase each loss size. 1.0 = unchanged, 1.2 = losses 20% larger',
    chartsSliderWinRedDesc: 'Reduce each win size. 1.0 = unchanged, 0.8 = wins 20% smaller',
    chartsSliderWrDegDesc: 'Convert % of random TPs to SL. 0.1 = 10% of wins become losses',
    chartsSliderSlipDesc: 'Additional cost per trade in R (separate from Trade cost). 0.05 = −0.05R',
    chartsSliderHumanErrDesc: 'Tilt, forgot stop. With probability X% trade becomes −1R regardless of result',
    chartsSliderFatigueDesc: 'Scared of pullback, exited early. Each winning trade reduced by X%',
    chartsSliderBadSlipProbDesc: 'Probability that stop triggers at a worse price (gaps, news)',
    chartsSliderBadSlipMultDesc: 'Impact of bad execution. 1.4× = loss of −1R becomes −1.4R',
    chartsSliderMissedWinDesc: 'Missed a winning trade. Profit becomes 0R',
    chartsSliderFatigueFormat: (v: number) => `−${(v * 100).toFixed(0)}% of win`,

    // charts — StressSlider explain texts
    chartsExplainSurvivalModels: 'Maximum allowable account drawdown — the threshold after which the strategy is considered failed.',
    chartsExplainSurvivalScenario: 'You set a rule: if drawdown exceeds X R — you stop trading. This parameter simulates how many simulations reach this threshold.',
    chartsExplainSurvivalHow: 'Each MC simulation tracks maximum drawdown. If it exceeds the threshold — the simulation is counted as "blown". Survival Rate = % of simulations that survived.',
    chartsExplainSurvivalImpact: 'Lowering the threshold sharply reduces Survival Rate. At 5R threshold with a 3-4 trade losing streak you are almost guaranteed to blow. Realistic threshold — 10-20R.',

    chartsExplainLossAmpModels: 'Systematic increase in real losses vs backtest — wider spread, worse stop execution, news gaps.',
    chartsExplainLossAmpScenario: 'You trade backtest with SL=1R, but in live market stops trigger at 1.2R due to slippage and gaps during volatility.',
    chartsExplainLossAmpHow: 'Each losing trade in simulation is multiplied by this coefficient. 1.2× means −1R becomes −1.2R for each loss.',
    chartsExplainLossAmpImpact: 'Directly affects Total R and Max DD. At ×1.3 and WR 50% the system may become unprofitable. Most realistic range for active trading: 1.05–1.2.',

    chartsExplainWinRedModels: 'Early exit from profitable trades — you closed before target due to fear of reversal or reduced TP.',
    chartsExplainWinRedScenario: 'Backtest shows average win 2R, but in reality you exit at 1.6R due to psychological pressure or partial exits.',
    chartsExplainWinRedHow: 'Each winning trade in simulation is multiplied by this coefficient. 0.8× means +2R becomes +1.6R.',
    chartsExplainWinRedImpact: "Reduces average expectation (EV) and SQN. At 0.7× even a system with WR 60% can have negative EV. Combined with Loss Amplification — the toughest stress test.",

    chartsExplainWrDegModels: 'Win rate degradation — market changed, setup performs worse, or entry filtering deteriorated.',
    chartsExplainWrDegScenario: 'Backtest showed WR 55%, but due to market regime change or overtrade 10% of wins became losses.',
    chartsExplainWrDegHow: 'Randomly selected X% of wins are converted to losses (TP → SL). This reduces the real WR proportionally to the parameter value.',
    chartsExplainWrDegImpact: 'Strongest impact on low-RR systems. At WR 50% and degradation 0.15 real WR becomes ~42.5% — most systems with RR 1:1 become unprofitable.',

    chartsExplainSlipModels: 'Systematic execution slippage — difference between expected and actual entry/exit price.',
    chartsExplainSlipScenario: 'You trade on candle open but actually get a price 0.05R worse due to order delay or insufficient liquidity.',
    chartsExplainSlipHow: "A fixed negative cost in R is added to every trade (wins and losses). Separate from Trade Cost — models market slippage not commission.",
    chartsExplainSlipImpact: 'With 100 trades and 0.05R slippage this is -5R per year from slippage alone. Small impact per trade, but significant over large sample.',

    chartsExplainHumanErrModels: 'Psychological errors — tilt, rule violation, ignoring stops under emotional pressure.',
    chartsExplainHumanErrScenario: 'After a losing streak you did not set a stop or moved it further. Once every 20 trades you get a catastrophic loss instead of calculated one.',
    chartsExplainHumanErrHow: "With probability X% any trade (winning or losing) is replaced with a fixed -1R — regardless of original result.",
    chartsExplainHumanErrImpact: 'Even 2% errors noticeably hurt SQN and increase Max DD. At 5% frequency of catastrophic trades becomes a systemic problem — system loses edge.',

    chartsExplainFatigueModels: 'Accumulated trading fatigue — reduced quality of position holding after long sessions or trade sequences.',
    chartsExplainFatigueScenario: 'By end of day or after 5+ trades you exit before target. A 2R winning trade closes at 1.4R due to psychological fatigue.',
    chartsExplainFatigueHow: 'Each winning trade is reduced by X% of its value. 20% decay turns +2R into +1.6R on every win.',
    chartsExplainFatigueImpact: "Gradually 'eats' the system's EV. Combines with Win Reduction — together they model overall degradation of profit holding.",

    chartsExplainBadSlipProbModels: 'Probability of extreme slippage when stop triggers — opening gap, news, flash crash.',
    chartsExplainBadSlipProbScenario: 'You hold position overnight. Price gaps past your stop and you exit at a much worse price than planned.',
    chartsExplainBadSlipProbHow: 'With probability X% a losing trade is additionally multiplied by Bad Slip Multiplier. Two parameters work together.',
    chartsExplainBadSlipProbImpact: "Barely affects results alone — only paired with Bad Slip Mult. At 20% prob and 2× mult every fifth loss becomes twice as large.",

    chartsExplainBadSlipMultModels: 'Size of loss when bad execution triggers (paired with Bad Slip Prob).',
    chartsExplainBadSlipMultScenario: 'News gap — stop at -1R but actual exit at -2.5R. Market swept through liquidity and continued before reversing.',
    chartsExplainBadSlipMultHow: 'When Bad Slip Prob triggers, the loss is multiplied by this coefficient. 2.0× at -1R gives -2R actual loss.',
    chartsExplainBadSlipMultImpact: 'Critically affects Max DD when combined with high Prob. ×3 even at 10% prob can destroy Survival Rate.',

    chartsExplainMissedWinModels: "Missed profitable opportunities — didn't get in, got distracted, already in position, decided to skip the setup.",
    chartsExplainMissedWinScenario: 'Setup triggered while you were asleep or busy. 15% of setups you simply do not take — they play out without you.',
    chartsExplainMissedWinHow: 'X% of randomly selected winning trades are replaced with 0R — as if you did not enter. Losing trades remain unchanged.',
    chartsExplainMissedWinImpact: 'Asymmetrically worsens result — you miss wins but not losses. Reduces WR and Total R. 15% missed wins ≈ -15% of total profit.',
    chartsGoToSettings: 'Go to settings',
    chartsSimsUnit: (n: string) => `${n} sims`,
    chartsHorizonUnit: (h: string) => `horizon ${h}`,
    chartsSimError: (msg: string) => `Error: ${msg}`,
    chartsMcRunError: 'Simulation error',
    chartsUnnamedCombo: 'Unnamed',
    chartsResetFilter: 'Reset filter',
    chartsFilterActive: '· filter active',
    chartsActiv: 'Asset',

    // charts — SCF block labels
    chartsEqInNorm: 'Within range',
    chartsEqBelowNorm: 'Below normal',
    chartsEqBelowNormCrit: 'Below normal !!!',
    chartsDdAboveNormCrit: 'Above normal !!!',
    chartsDdAboveNorm: 'Above normal',
    chartsDdBelowNorm: 'Below normal',
    chartsDdInNorm: 'Within range',
    chartsSqnBelowNorm: 'Below normal',
    chartsSqnInNormYellow: 'Within range',
    chartsSqnInNorm: 'Within range',
    chartsSqnAboveNorm: 'Above normal',
    chartsWrBelowNormCrit: 'Below normal !!!',
    chartsWrBelowNorm: 'Below normal',
    chartsWrInNorm: 'Within range',
    chartsStrkAboveNormCrit: 'Above normal !!!',
    chartsStrkAboveNorm: 'Elevated',
    chartsStrkInNorm: 'Within range',
    chartsPfBelowNormCrit: 'Below normal !!!',
    chartsPfBelowMedian: 'Below median',
    chartsPfInNorm: 'Within range',

    // charts — SCF accordion labels
    chartsScfEqProfit: 'Exp. Med. Profit — contributing factors',
    chartsScfEqLoss: 'Exp. Med. Loss — contributing factors',
    chartsScfDdMed: 'Med. DD — contributing factors',
    chartsScfSqnMed: 'Med. SQN — contributing factors',
    chartsScfWrMed: 'Med. WR — contributing factors',
    chartsScfStrk: 'Losing Streak — contributing factors',
    chartsScfPf: 'Profit Factor — contributing factors',
    chartsMedianaShort: 'Median',

    // charts — deviation table
    chartsDevFromMedProfit: 'Dev. from med. profit',
    chartsBtDevFromMedProfit: 'BT dev. from med. profit',

    // charts — equity view mode
    chartsEquityCurves: (mode: string) => `Equity Curves — ${mode}`,
    chartsEquityGrowthRate: 'Avg R/trade (growth rate)',

    // charts — rolling analysis lines (long analytical texts)
    chartsRollingWrDesc: 'Win rate percentage in rolling window (BT=20 trades, Live=10).\n',
    chartsRollingWrBelowP5: (lv: string, p5: string) => `⚠️ WR (${lv}%) dropped below p5 (${p5}%) — alert signal. Strategy is degrading or market regime has changed.`,
    chartsRollingWrAboveP95: (lv: string, p95: string) => `WR (${lv}%) above p95 (${p95}%) — unusually good. Possibly a short-term lucky streak, monitor for stability.`,
    chartsRollingWrBelowMed: (lv: string, med: string) => `WR (${lv}%) noticeably below MC median (${med}%), but still within p5–p95. Downward trend — worth watching.`,
    chartsRollingWrNearMed: (lv: string, med: string) => `WR (${lv}%) close to MC median (${med}%) and within normal p5–p95. Strategy performing as expected.`,
    chartsRollingWrAboveMed: (lv: string, med: string) => `WR (${lv}%) above MC median (${med}%) and within normal range. Good result.`,
    chartsRollingWrBtBehind: (dev: string, bt: string) => `Lagging backtest: −${dev}pp. BT WR ${bt}% — Live not reaching that level.`,
    chartsRollingWrBtAhead: (dev: string, bt: string) => `Live WR exceeds backtest by +${dev}pp (BT ${bt}%). Possibly a favourable market phase.`,
    chartsRollingWrBtMatch: (lv: string, bt: string) => `Live WR (${lv}%) matches backtest (${bt}%) — deviation is negligible.`,
    chartsRollingWrConclusionCrit: '\nConclusion: strategy under pressure. If WR does not recover within the next 10–15 trades — consider a pause for analysis.',
    chartsRollingWrConclusionWarn: '\nConclusion: WR declined relative to backtest and MC expectations, but still within the acceptable corridor. If the curve breaks p5 — that is an alert signal.',
    chartsRollingWrConclusionOk: '\nConclusion: WR is in the normal range, strategy performing as expected.',

    chartsRollingRrDesc: 'Average risk/reward ratio in rolling window (BT=20, Live=10).\n',
    chartsRollingRrBelowP5: (lv: string, p5: string) => `⚠️ Avg RR (${lv}) below p5 (${p5}) — execution quality critically declined. Check exit discipline.`,
    chartsRollingRrAboveP95: (lv: string, p95: string) => `Avg RR (${lv}) above p95 (${p95}) — unusually high. Possible streak of exceptional trades.`,
    chartsRollingRrBelowMed: (lv: string, med: string) => `Avg RR (${lv}) noticeably below MC median (${med}), but still within p5–p95. Entry quality declining — watch closely.`,
    chartsRollingRrNearMed: (lv: string, med: string) => `Avg RR (${lv}) close to MC median (${med}) — execution quality is normal.`,
    chartsRollingRrAboveMed: (lv: string, med: string) => `Avg RR (${lv}) above MC median (${med}) — excellent trade quality in current window.`,
    chartsRollingRrBtBehind: (dev: string, bt: string) => `Lagging backtest: ${dev}%. BT Avg RR ${bt} — Live not reaching expected level.`,
    chartsRollingRrBtAhead: (dev: string, bt: string) => `Live Avg RR exceeds backtest by +${dev}% (BT ${bt}).`,
    chartsRollingRrBtMatch: (lv: string, bt: string) => `Live Avg RR (${lv}) matches backtest (${bt}) — deviation is negligible.`,
    chartsRollingRrConclusionCrit: '\nConclusion: execution quality under serious pressure. Analyse recent trades — exit discipline or setup quality may have changed.',
    chartsRollingRrConclusionWarn: '\nConclusion: Avg RR declined relative to expectations, but still in acceptable corridor. Continue monitoring.',
    chartsRollingRrConclusionOk: '\nConclusion: Avg RR in normal range, execution quality matches backtest.',

    chartsRollingPfDesc: 'Profit Factor = Sum of wins / Sum of losses in rolling window (BT=20, Live=10). PF > 1 = profitable.\n',
    chartsRollingPfBelowP5: (lv: string, p5: string) => `⚠️ PF (${lv}) below p5 (${p5}) — strategy is losing and beyond acceptable limits. Serious signal.`,
    chartsRollingPfAboveP95: (lv: string, p95: string) => `PF (${lv}) above p95 (${p95}) — unusually high profitability in window. Possible streak.`,
    chartsRollingPfBelowMed: (lv: string, med: string) => `PF (${lv}) noticeably below MC median (${med}), but still within normal p5–p95. Downward trend.`,
    chartsRollingPfNearMed: (lv: string, med: string) => `PF (${lv}) close to MC median (${med}) — profitability matches expectations.`,
    chartsRollingPfAboveMed: (lv: string, med: string) => `PF (${lv}) above MC median (${med}) — profitability better than expected.`,
    chartsRollingPfBtBehind: (dev: string, bt: string) => `PF lagging backtest by ${dev}% (BT ${bt}). Live less profitable than backtest.`,
    chartsRollingPfBtAhead: (dev: string, bt: string) => `Live PF exceeds backtest by +${dev}% (BT ${bt}).`,
    chartsRollingPfBtMatch: (lv: string, bt: string) => `Live PF (${lv}) matches backtest (${bt}) — deviation is negligible.`,
    chartsRollingPfConclusionCrit: '\nConclusion: strategy is losing in current window. If PF does not recover — consider a pause for analysis.',
    chartsRollingPfConclusionCrit2: '\nConclusion: PF critically low. Review exit management and setup quality.',
    chartsRollingPfConclusionWarn: '\nConclusion: PF below expected, but still in range. Continue monitoring, do not change strategy.',
    chartsRollingPfConclusionOk: '\nConclusion: Profit Factor in normal range, strategy profitable as expected.',

    chartsRollingDdDesc: 'Maximum drawdown (in R) from peak to trough in rolling window (BT=20, Live=10). Lower = better.\n',
    chartsRollingDdAboveP95: (lv: string, p95: string) => `⚠️ Max DD (${lv}R) exceeds p95 (${p95}R) — drawdown beyond expected range. Elevated risk.`,
    chartsRollingDdBelowP5: (lv: string, p5: string) => `Max DD (${lv}R) very low (below p5 ${p5}R) — unusually small drawdown. Possible lucky streak.`,
    chartsRollingDdAboveMed: (lv: string, med: string) => `Max DD (${lv}R) noticeably above MC median (${med}R), but still within p5–p95. Drawdown growing — watch closely.`,
    chartsRollingDdNearMed: (lv: string, med: string) => `Max DD (${lv}R) close to MC median (${med}R) — drawdown within normal range.`,
    chartsRollingDdBelowMed: (lv: string, med: string) => `Max DD (${lv}R) below MC median (${med}R) — risk control better than expected.`,
    chartsRollingDdBtHigher: (dev: string, bt: string) => `Live DD +${dev}% higher than backtest (BT ${bt}R) — live trading carries more drawdown.`,
    chartsRollingDdBtLower: (dev: string, bt: string) => `Live DD ${dev}% lower than backtest (BT ${bt}R) — live controls risk better.`,
    chartsRollingDdBtMatch: (lv: string, bt: string) => `Live DD (${lv}R) matches backtest (${bt}R) — deviation is negligible.`,
    chartsRollingDdConclusionCrit: '\nConclusion: drawdown is critical. Reduce position size or pause until stabilisation.',
    chartsRollingDdConclusionWarn: '\nConclusion: drawdown elevated relative to expectations, but still within acceptable range. Monitor risk management.',
    chartsRollingDdConclusionOk: '\nConclusion: Max Drawdown in normal range, risk management matches backtest.',

    chartsStdDevExplanation: `Standard deviation of Net R distribution in rolling window. Measures consistency of results. Low value = stable results. A sharp rise in StdDev signals increased instability in live trading relative to backtest.

How to read:
• Both curves level → Live is as consistent as backtest
• Blue higher than grey → Live results more chaotic, larger R spread
• Blue lower than grey → Live more stable (rare)`,

    // charts — comparison mode labels
    chartsCompModeDesc: (mode: string, cmpN: number | null) =>
      mode === 'cumulative'
        ? 'Mode: cumulative — comparing final values of all trades.'
        : `Mode: normalised — comparing by ${cmpN} trades (shorter series).`,
    chartsLiveNetVsBtNet: (sign: string, r: string, pct: string, type: 'close' | 'below' | 'behind' | 'ahead') => {
      if (type === 'close') return `Live Net vs BT Net: ${sign}${r}R (${sign}${pct}%) — Live close to backtest, deviation within normal range.`;
      if (type === 'below') return `Live Net vs BT Net: ${sign}${r}R (${sign}${pct}%) — Live significantly below backtest. Possible causes: market regime shift, backtest overfitting, or strategy degradation.`;
      if (type === 'behind') return `Live Net vs BT Net: ${sign}${r}R (${sign}${pct}%) — Live lagging backtest. Worth checking if market conditions have changed.`;
      return `Live Net vs BT Net: ${sign}${r}R (${sign}${pct}%) — Live ahead of backtest. Market may be currently favourable for the strategy.`;
    },
    chartsGrossCheck: 'Gross deviation smaller than Net — commissions/slippage amplifying Live underperformance vs backtest.',
    chartsGrossSameAsNet: (pct: string) => `Live Gross vs BT Gross: ${pct} — deviation almost the same as Net. Commissions are not the main cause.`,
    chartsLiveCostPct: (pct: string) => `Live commissions: −${pct}% of Gross profit.`,
    chartsCostBtVsLiveHigher: (bt: string, lv: string) => `Backtest commissions were −${bt}%, Live — −${lv}%. Live paying more than built into backtest.`,
    chartsCostMatch: (lv: string, bt: string) => `Live commission level (${lv}%) close to backtest (${bt}%).`,
    chartsCompMetrics: 'Metric comparison',
    chartsCompModeLabel: (cmpN: number | null) =>
      cmpN != null ? ` (by ${cmpN} tr.)` : '',
    chartsDeviationFull: (nLabel: string) => `Deviation${nLabel}`,
    chartsMcBandHeaderBootstrap: 'Monte Carlo — Stress Simulation',
    chartsMcBootstrapDesc: 'Bootstrap + stress factors · Manual run',
  },
} as const;

export type TKeys = keyof typeof T['uk'];

/** React hook — re-renders when lang changes (listens to storage event) */
import { useState, useEffect } from 'react';
export function useT() {
  const [lang, setLang] = useState<Lang>(getLang);
  useEffect(() => {
    const handler = () => setLang(getLang());
    window.addEventListener('storage', handler);
    // also listen for same-tab changes via custom event
    window.addEventListener('platform_lang_changed', handler);
    return () => {
      window.removeEventListener('storage', handler);
      window.removeEventListener('platform_lang_changed', handler);
    };
  }, []);
  return T[lang];
}
