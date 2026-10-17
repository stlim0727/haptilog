export type Language = "en" | "ko";

export const translations = {
  en: {
    brand_slogan: "A LITTLE SPACE TO REFLECT",
    wrist_promise: "Made for your wrist. Open on the web.",
    disconnect: "Disconnect browser",
    from_wrist: "FROM YOUR WRIST, TO HERE",
    hero_title: "Your voice.\nA little clearer.",
    hero_subtitle:
      "That passing thought. The coffee on the corner.\nA moment worth keeping. Come back to it here.",
    capture_moment: "CAPTURE IN THE MOMENT",
    review_pace: "Review at your own pace.",
    promise_audio: "Your original audio, always",
    promise_browser: "Only the browsers you connect",
    step_label: "YOUR WATCH → YOUR BROWSER",
    connect_title: "Make the connection.",
    connect_desc:
      "On your watch, open Web access and tap Create code. Enter what you see below.",
    watch_id: "Watch ID",
    access_code: "Access code",
    expires_in: "Expires after 5 minutes",
    connect_btn: "Connect my watch",
    connecting: "Connecting…",
    pair_footnote:
      "No phone. No password. Just your watch.\nDisconnect this browser any time.",
    evening_review: "YOUR EVENING REVIEW",
    workspace_title: "A day, in your own words.",
    workspace_subtitle: "Listen back. Find the details. Pick up a thought.",
    all_time: "All time",
    today: "Today",
    this_month: "This month",
    export_csv: "Export CSV",
    spending_label: "SPENDING · SELECTED PERIOD",
    spending_count: "Each currency counted separately",
    spending_incomplete: (count: number) =>
      `${count} expense${count > 1 ? "s" : ""} need amount or currency`,
    moments_label: "MOMENTS CAPTURED",
    recordings_unit: "recordings",
    ready_label: "READY TO REVIEW",
    awaiting_label: (count: number) =>
      count
        ? `${count} awaiting attention or analysis`
        : "Your uploaded moments, at a glance",
    map_heading: "Your voices, by place",
    map_desc:
      "Select a pin to open a recording. Date, category and search filters apply.",
    show_map: "Show map",
    hide_map: "Hide map",
    loading_map: "Loading map…",
    your_moments: "Your moments",
    trash: "Trash",
    empty_trash: "Empty trash",
    search_placeholder: "Find a thought…",
    all_cat: "All",
    expense_cat: "Expense",
    travel_cat: "Travel",
    workout_cat: "Workout",
    memo_cat: "Memo",
    empty_active_title: "Nothing here just yet.",
    empty_first_title: "Your first moment starts on your wrist.",
    empty_active_desc: "Try another date, category, or search.",
    empty_first_desc:
      "Record a thought on your watch and enable cloud sync. It will appear here after upload.",
    empty_trash_title: "Trash is empty.",
    empty_trash_desc:
      "Deleted moments will appear here until permanently removed.",
    original_details: "THE ORIGINAL & THE DETAILS",
    move_to_trash: "Move to trash",
    in_trash: "In trash",
    moved_to_trash_on: "Moved to trash on",
    restore: "Restore",
    delete_permanently: "Delete permanently",
    original_audio: "ORIGINAL AUDIO",
    audio_truth: "Always your source of truth",
    load_audio: "Load original audio",
    loading_audio: "Loading original…",
    speed: "Speed",
    download_audio: "Download .m4a",
    transcript: "TRANSCRIPT",
    transcript_note: "AI generated · check against audio",
    no_speech: "No speech detected.",
    expense_details: "EXPENSE DETAILS",
    expense_note: "Your corrections are kept",
    amount: "Amount",
    currency: "Currency",
    merchant: "Merchant",
    category: "Category",
    retry_analysis: "Retry analysis",
    analysing: "Analysing…",
    toast_moved_trash: "Recording moved to trash.",
    undo: "Undo",
    confirm_delete: "Permanently delete this recording? This cannot be undone.",
    confirm_empty_trash: (count: number) =>
      `Permanently delete all ${count} recordings in trash?`,
    closer_listen_title: "A closer listen.",
    closer_listen_desc:
      "Select a moment to hear the original,\nread the transcript, and explore the details.",
    save_corrections: "Save corrections",
    saving: "Saving…",
    follow_up_thoughts: "THOUGHTS TO FOLLOW UP",
    audio_unavailable: "Audio not available yet",
    audio_play_error:
      "This audio could not be played by your browser. Download the original to inspect it.",
    audio_load_error:
      "Original audio could not be loaded. Try again when connected.",
    save_error: "Changes were not saved. Try again when connected.",
    expense_validation:
      "Enter a non-negative amount and a three-letter currency, such as KRW.",
    listening_details: "Listening for the details…",
    audio_comes_first: "Your audio comes first.",
    analysis_in_progress:
      "Analysis is in progress. You can still listen to the original.",
    cloud_checked: (time: string) => `Cloud checked ${time}`,
    watch_queue_unknown: "Watch offline queue unknown",
    showing_limit_note:
      "Showing the most recent 500 recordings. Totals and exports cover only these loaded recordings. Dates use your browser’s timezone.",
    privacy_policy: "Privacy Policy",
    footer_quiet: "CAPTURE QUIETLY. COME BACK CLEARLY.",
    opening_space: "Opening your space…",
    finding_moments: "Finding your moments…",
    checking_cloud: "Checking cloud…",
    portal_setup_ready: "This portal is ready for setup.",
    portal_setup_desc:
      "Configure the Supabase URL and publishable key to connect your watch.",
    captured_context: "CAPTURED CONTEXT",
    all_details: "All generated details",
    analysis_version: "Analysis version",
    demo_note:
      "Original audio stays on your watch. No demo recordings here.",
    timezone_note: (tz: string) =>
      `Dates and daily totals use ${tz}. Only uploaded recordings are visible here.`,
    location_snapshot: "A location snapshot, recorded with your voice.",
    no_location: "No location was captured for this recording.",
  },
  ko: {
    brand_slogan: "잠시 생각을 정리하는 공간",
    wrist_promise: "손목에서 시작하여 웹에서 확인하세요.",
    disconnect: "브라우저 연결 해제",
    from_wrist: "손목의 순간을 여기로",
    hero_title: "목소리로 담은 순간.\n더 선명하게.",
    hero_subtitle:
      "스쳐 지나간 생각, 길모퉁이의 커피 한 잔.\n간직할 만한 순간을 여기서 다시 만나보세요.",
    capture_moment: "그 순간에 바로 녹음",
    review_pace: "편안한 시간에 확인하세요.",
    promise_audio: "언제나 원본 음성 그대로",
    promise_browser: "연결한 브라우저에만 안전하게",
    step_label: "워치에서 → 브라우저로",
    connect_title: "워치와 연결하기",
    connect_desc:
      "워치에서 '웹 접속'을 열고 '코드 생성'을 누른 후, 아래에 입력하세요.",
    watch_id: "워치 ID",
    access_code: "접속 코드",
    expires_in: "5분 후 만료",
    connect_btn: "워치 연결하기",
    connecting: "연결 중…",
    pair_footnote:
      "휴대폰도 비밀번호도 필요 없습니다. 오직 워치 하나로.\n언제든 브라우저 연결을 해제할 수 있습니다.",
    evening_review: "하루의 리뷰",
    workspace_title: "나의 언어로 돌아보는 하루.",
    workspace_subtitle: "목소리를 다시 듣고, 세부 정보를 확인하고, 생각을 정리하세요.",
    all_time: "전체 기간",
    today: "오늘",
    this_month: "이번 달",
    export_csv: "CSV 내보내기",
    spending_label: "지출 · 선택한 기간",
    spending_count: "통화별로 각각 합산됩니다",
    spending_incomplete: (count: number) =>
      `${count}건의 지출에 금액 또는 통화 정보가 필요합니다`,
    moments_label: "기록된 순간",
    recordings_unit: "개 기록",
    ready_label: "분석 완료",
    awaiting_label: (count: number) =>
      count
        ? `${count}개 분석 또는 확인 필요`
        : "업로드된 순간들을 한눈에 확인하세요",
    map_heading: "장소별 음성 기록",
    map_desc:
      "핀을 선택하여 녹음을 확인하세요. 날짜, 카테고리, 검색 필터가 적용됩니다.",
    show_map: "지도 보기",
    hide_map: "지도 숨기기",
    loading_map: "지도 불러오는 중…",
    your_moments: "나의 기록",
    trash: "휴지통",
    empty_trash: "휴지통 비우기",
    search_placeholder: "기록 검색…",
    all_cat: "전체",
    expense_cat: "지출",
    travel_cat: "여행",
    workout_cat: "운동",
    memo_cat: "메모",
    empty_active_title: "아직 기록이 없습니다.",
    empty_first_title: "첫 번째 순간을 워치에서 녹음해 보세요.",
    empty_active_desc: "다른 날짜, 카테고리 또는 검색어를 시도해 보세요.",
    empty_first_desc:
      "워치에서 생각을 녹음하고 클라우드 동기화를 켜면 여기에 나타납니다.",
    empty_trash_title: "휴지통이 비어 있습니다.",
    empty_trash_desc:
      "삭제한 기록은 영구 삭제되기 전까지 여기에 보관됩니다.",
    original_details: "원본 음성 및 세부 정보",
    move_to_trash: "휴지통으로 이동",
    in_trash: "휴지통 보관 중",
    moved_to_trash_on: "휴지통 이동일:",
    restore: "복구",
    delete_permanently: "영구 삭제",
    original_audio: "원본 음성",
    audio_truth: "언제나 가장 신뢰할 수 있는 원본",
    load_audio: "원본 음성 불러오기",
    loading_audio: "음성 불러오는 중…",
    speed: "재생 속도",
    download_audio: ".m4a 다운로드",
    transcript: "음성 텍스트",
    transcript_note: "AI 생성 · 원본 음성과 비교 확인",
    no_speech: "감지된 음성이 없습니다.",
    expense_details: "지출 세부 정보",
    expense_note: "수정한 내용은 안전하게 보관됩니다",
    amount: "금액",
    currency: "통화",
    merchant: "사용처/가맹점",
    category: "카테고리",
    retry_analysis: "다시 분석하기",
    analysing: "분석 중…",
    toast_moved_trash: "기록을 휴지통으로 이동했습니다.",
    undo: "실행 취소",
    confirm_delete: "이 기록을 영구 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.",
    confirm_empty_trash: (count: number) =>
      `휴지통의 기록 ${count}개를 모두 영구 삭제하시겠습니까?`,
    closer_listen_title: "자세히 듣고 살펴보기.",
    closer_listen_desc:
      "순간을 선택하여 원본 음성을 듣고,\n전사 텍스트와 세부 정보를 확인하세요.",
    save_corrections: "수정 내용 저장",
    saving: "저장 중…",
    follow_up_thoughts: "확인 및 후속 조치할 생각",
    audio_unavailable: "음성을 아직 사용할 수 없습니다",
    audio_play_error:
      "브라우저에서 음성을 재생할 수 없습니다. 원본을 다운로드하여 확인하세요.",
    audio_load_error:
      "원본 음성을 불러오지 못했습니다. 네트워크 연결 후 다시 시도해 주세요.",
    save_error: "변경 사항이 저장되지 않았습니다. 네트워크 연결 후 다시 시도해 주세요.",
    expense_validation:
      "0 이상의 금액과 3자리 통화 코드(예: KRW)를 입력하세요.",
    listening_details: "세부 정보를 분석하는 중…",
    audio_comes_first: "원본 음성이 안전하게 보관되어 있습니다.",
    analysis_in_progress:
      "분석이 진행 중입니다. 원본 음성은 바로 들으실 수 있습니다.",
    cloud_checked: (time: string) => `클라우드 확인 ${time}`,
    watch_queue_unknown: "워치 오프라인 대기열 상태 알 수 없음",
    showing_limit_note:
      "최근 500개의 녹음 기록을 표시합니다. 통계 및 CSV 내보내기는 로드된 기록을 기준으로 계산됩니다. 날짜는 브라우저 시간대를 따릅니다.",
    privacy_policy: "개인정보처리방침",
    footer_quiet: "조용하게 기록하고, 선명하게 다시 만나다.",
    opening_space: "공간을 여는 중…",
    finding_moments: "기록을 찾는 중…",
    checking_cloud: "클라우드 확인 중…",
    portal_setup_ready: "포털 설정이 준비되었습니다.",
    portal_setup_desc:
      "워치를 연결하려면 Supabase URL과 공개 키를 구성하세요.",
    captured_context: "기록 위치 정보",
    all_details: "생성된 모든 세부 정보",
    analysis_version: "분석 버전",
    demo_note:
      "원본 오디오는 워치에 안전하게 보관됩니다. 데모 녹음은 여기에 표시되지 않습니다.",
    timezone_note: (tz: string) =>
      `날짜 및 일일 합계는 ${tz} 기준입니다. 업로드된 녹음만 여기에 표시됩니다.`,
    location_snapshot: "음성과 함께 기록된 위치 스냅샷입니다.",
    no_location: "이 녹음에 대한 위치 정보가 없습니다.",
  },
} as const;

export type TranslationKeys = {
  [K in keyof typeof translations.en]: (typeof translations.en)[K] extends (
    ...args: infer A
  ) => infer R
    ? (...args: A) => R
    : string;
};

export function getInitialLanguage(): Language {
  if (typeof window === "undefined") return "en";
  const stored = localStorage.getItem("haptilog_language");
  if (stored === "ko" || stored === "en") return stored;
  return navigator.language.startsWith("ko") ? "ko" : "en";
}
