import type { Recording } from "./domain.ts";
import { toLocalDateString } from "./domain.ts";

export const DEMO_MODE_STORAGE_KEY = "haptilog_demo_mode";
export const DEMO_RECORDS_STORAGE_KEY = "haptilog_demo_records";
export const DEMO_SESSION_ID = "demo-preview-session-0001";
export const DEMO_WATCH_ID = "HL-PREVIEW99";
export const DEMO_OWNER_ID = "demo-preview-owner-0001";

export function isPreviewEnvironment(): boolean {
  if (typeof window === "undefined") return false;

  // 1. Explicitly disabled (e.g. in production builds)
  if (import.meta.env.VITE_DISABLE_TEST_LOGIN === "true") return false;

  // 2. Production custom domain
  const host =
    (window as unknown as { __HAPTILOG_HOSTNAME_OVERRIDE__?: string })
      .__HAPTILOG_HOSTNAME_OVERRIDE__ || window.location.hostname;
  if (host === "haptilog.keepory.app") return false;

  // 3. Cloudflare Workers / Pages preview URLs (*.workers.dev, *.pages.dev) or localhost
  if (
    host.endsWith(".workers.dev") ||
    host.endsWith(".pages.dev") ||
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "0.0.0.0"
  ) {
    return true;
  }

  // 4. Explicitly enabled via env var
  if (import.meta.env.VITE_ENABLE_TEST_LOGIN === "true") return true;

  // 5. In local dev mode
  if (import.meta.env.DEV) return true;

  return false;
}

export function isDemoSessionActive(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(DEMO_MODE_STORAGE_KEY) === "true";
}

export function getStoredDemoRecords(): Recording[] | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(DEMO_RECORDS_STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Recording[];
  } catch {
    return null;
  }
}

export function saveStoredDemoRecords(records: Recording[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(DEMO_RECORDS_STORAGE_KEY, JSON.stringify(records));
}

export function clearDemoState() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(DEMO_MODE_STORAGE_KEY);
  localStorage.removeItem(DEMO_RECORDS_STORAGE_KEY);
}

/**
 * Generates dynamic sample recordings relative to current time so that
 * Today / This Month / Calendar / Daily Journal Strip / Map all populate dynamically.
 */
export function generateSampleRecordings(): Recording[] {
  const now = Date.now();
  const hour = 3600 * 1000;
  const day = 24 * hour;

  const iso = (msAgo: number) => new Date(now - msAgo).toISOString();

  const samples: Recording[] = [
    // 1. EXPENSE (Today - 2 hours ago)
    {
      id: "demo-rec-001",
      user_id: DEMO_OWNER_ID,
      audio_path: "demo/rec-001.wav",
      recorded_at: iso(2 * hour),
      created_at: iso(2 * hour),
      duration_seconds: 14,
      latitude: 37.5443,
      longitude: 127.045,
      accuracy: 6,
      altitude: 21,
      speed: 1.1,
      voice_enrichments: [
        {
          pipeline_version: "v1",
          created_at: iso(2 * hour - 30 * 1000),
          intent_type: "EXPENSE",
          summary: "블루보틀 성수 아이스 바닐라 라떼 2잔 결제",
          transcript: "성수동 블루보틀에서 아이스 바닐라 라떼 두 잔 결제. 13,000원.",
          structured_data: {
            amount: 13000,
            currency: "KRW",
            merchant: "블루보틀 성수",
            category: "카페/식음료",
          },
        },
      ],
      enrichment_status: null,
      recording_corrections: null,
    },

    // 2. TRAVEL (Today - 5 hours ago)
    {
      id: "demo-rec-002",
      user_id: DEMO_OWNER_ID,
      audio_path: "demo/rec-002.wav",
      recorded_at: iso(5 * hour),
      created_at: iso(5 * hour),
      duration_seconds: 24,
      latitude: 37.5796,
      longitude: 126.977,
      accuracy: 5,
      altitude: 45,
      speed: 0.8,
      voice_enrichments: [
        {
          pipeline_version: "v1",
          created_at: iso(5 * hour - 25 * 1000),
          intent_type: "TRAVEL",
          summary: "경복궁 향원정 가을 단풍 산책",
          transcript:
            "경복궁 향원정 주변 단풍이 아주 곱게 물들었음. 날씨가 맑아서 산책하기 좋고 외국인 관광객들이 많음.",
          structured_data: {
            place: "경복궁 향원정",
            highlights: ["가을 단풍", "향원정 연못", "고궁 산책"],
          },
        },
      ],
      enrichment_status: null,
      recording_corrections: null,
    },

    // 3. MEMO (Today - 7 hours ago)
    {
      id: "demo-rec-003",
      user_id: DEMO_OWNER_ID,
      audio_path: "demo/rec-003.wav",
      recorded_at: iso(7 * hour),
      created_at: iso(7 * hour),
      duration_seconds: 32,
      latitude: 37.5665,
      longitude: 126.978,
      accuracy: 8,
      altitude: 35,
      speed: 0,
      voice_enrichments: [
        {
          pipeline_version: "v1",
          created_at: iso(7 * hour - 20 * 1000),
          intent_type: "MEMO",
          summary: "스프린트 기획 아이디어 및 TODO",
          transcript:
            "다음 주 스프린트 안건 정리: 첫째, 워치 타일 원터치 녹음 최적화하기. 둘째, 오프라인 녹음 큐 상태 UI 동기화. 셋째, 노션 인박스 연동 테스트 케이스 추가.",
          structured_data: {
            action_items: [
              "워치 타일 원터치 녹음 최적화하기",
              "오프라인 녹음 큐 상태 UI 동기화",
              "노션 인박스 연동 테스트 케이스 추가",
            ],
          },
        },
      ],
      enrichment_status: null,
      recording_corrections: {
        recording_id: "demo-rec-003",
        amount: null,
        currency: null,
        merchant: null,
        category: null,
        completed_tasks: ["워치 타일 원터치 녹음 최적화하기"],
        updated_at: iso(1 * hour),
      },
    },

    // 4. WORKOUT (Yesterday - 1 day ago)
    {
      id: "demo-rec-004",
      user_id: DEMO_OWNER_ID,
      audio_path: "demo/rec-004.wav",
      recorded_at: iso(1 * day + 3 * hour),
      created_at: iso(1 * day + 3 * hour),
      duration_seconds: 22,
      latitude: 37.5103,
      longitude: 126.996,
      accuracy: 4,
      altitude: 15,
      speed: 3.2,
      voice_enrichments: [
        {
          pipeline_version: "v1",
          created_at: iso(1 * day + 3 * hour - 20 * 1000),
          intent_type: "WORKOUT",
          summary: "한강 반포지구 5km 아침 러닝",
          transcript:
            "한강 반포 달빛광장에서 잠수교 방향으로 아침 러닝 5km 완주. 평균 페이스 5분 20초, 심박수 152bpm.",
          structured_data: {
            activity: "Running",
            distance_km: 5.2,
            duration_minutes: 27,
            avg_heart_rate: 152,
          },
        },
      ],
      enrichment_status: null,
      recording_corrections: null,
    },

    // 5. EXPENSE (Yesterday - 1 day + 7 hours ago)
    {
      id: "demo-rec-005",
      user_id: DEMO_OWNER_ID,
      audio_path: "demo/rec-005.wav",
      recorded_at: iso(1 * day + 7 * hour),
      created_at: iso(1 * day + 7 * hour),
      duration_seconds: 19,
      latitude: 37.5714,
      longitude: 126.9768,
      accuracy: 7,
      altitude: 38,
      speed: 0,
      voice_enrichments: [
        {
          pipeline_version: "v1",
          created_at: iso(1 * day + 7 * hour - 15 * 1000),
          intent_type: "EXPENSE",
          summary: "광화문 팀 저녁 회식비 삼겹살 결제",
          transcript:
            "광화문 고깃집에서 팀 회식비 삼겹살 4인분과 된장찌개 결제 완료. 78,000원.",
          structured_data: {
            amount: 78000,
            currency: "KRW",
            merchant: "광화문 고깃집",
            category: "회식/식사",
          },
        },
      ],
      enrichment_status: null,
      recording_corrections: null,
    },

    // 6. EXPENSE (3 days ago - USD subscription, locationless)
    {
      id: "demo-rec-006",
      user_id: DEMO_OWNER_ID,
      audio_path: "demo/rec-006.wav",
      recorded_at: iso(3 * day),
      created_at: iso(3 * day),
      duration_seconds: 9,
      latitude: null,
      longitude: null,
      accuracy: null,
      altitude: null,
      speed: null,
      voice_enrichments: [
        {
          pipeline_version: "v1",
          created_at: iso(3 * day - 30 * 1000),
          intent_type: "EXPENSE",
          summary: "GitHub Copilot monthly subscription",
          transcript: "GitHub Copilot monthly subscription payment 10 dollars.",
          structured_data: {
            amount: 10,
            currency: "USD",
            merchant: "GitHub",
            category: "Software",
          },
        },
      ],
      enrichment_status: null,
      recording_corrections: null,
    },

    // 7. TRAVEL (5 days ago)
    {
      id: "demo-rec-007",
      user_id: DEMO_OWNER_ID,
      audio_path: "demo/rec-007.wav",
      recorded_at: iso(5 * day),
      created_at: iso(5 * day),
      duration_seconds: 18,
      latitude: 37.5512,
      longitude: 126.9882,
      accuracy: 9,
      altitude: 243,
      speed: 0.5,
      voice_enrichments: [
        {
          pipeline_version: "v1",
          created_at: iso(5 * day - 20 * 1000),
          intent_type: "TRAVEL",
          summary: "남산서울타워 야경 전망대 방문",
          transcript:
            "남산타워 케이블카 타고 올라옴. 서울 시내 야경이 한눈에 내려다보이고 바람이 조금 쌀쌀함.",
          structured_data: {
            place: "남산서울타워",
            highlights: ["서울 야경", "케이블카", "전망대"],
          },
        },
      ],
      enrichment_status: null,
      recording_corrections: null,
    },

    // 8. WORKOUT (8 days ago)
    {
      id: "demo-rec-008",
      user_id: DEMO_OWNER_ID,
      audio_path: "demo/rec-008.wav",
      recorded_at: iso(8 * day),
      created_at: iso(8 * day),
      duration_seconds: 20,
      latitude: 37.5284,
      longitude: 126.9341,
      accuracy: 6,
      altitude: 12,
      speed: 5.8,
      voice_enrichments: [
        {
          pipeline_version: "v1",
          created_at: iso(8 * day - 10 * 1000),
          intent_type: "WORKOUT",
          summary: "여의도 한강 야간 사이클링 15km",
          transcript:
            "여의도에서 반포 왕복 15km 야간 라이딩 완료. 강바람 시원하고 자전거 도로 상태 양호함.",
          structured_data: {
            activity: "Cycling",
            distance_km: 15.0,
            duration_minutes: 41,
          },
        },
      ],
      enrichment_status: null,
      recording_corrections: null,
    },

    // 9. MEMO (12 days ago)
    {
      id: "demo-rec-009",
      user_id: DEMO_OWNER_ID,
      audio_path: "demo/rec-009.wav",
      recorded_at: iso(12 * day),
      created_at: iso(12 * day),
      duration_seconds: 13,
      latitude: null,
      longitude: null,
      accuracy: null,
      altitude: null,
      speed: null,
      voice_enrichments: [
        {
          pipeline_version: "v1",
          created_at: iso(12 * day - 20 * 1000),
          intent_type: "MEMO",
          summary: "추천 도서 및 아티클 메모",
          transcript:
            "디자인 엔지니어링 추천 도서: 생각하지 않는 사람들, 실용주의 프로그래머 다시 읽어보기.",
          structured_data: {
            action_items: [
              "생각하지 않는 사람들 구매",
              "실용주의 프로그래머 복습",
            ],
          },
        },
      ],
      enrichment_status: null,
      recording_corrections: null,
    },

    // 10. TRASHED RECORDING (1 day ago, soft-deleted)
    {
      id: "demo-rec-010",
      user_id: DEMO_OWNER_ID,
      audio_path: "demo/rec-010.wav",
      recorded_at: iso(1 * day + 1 * hour),
      created_at: iso(1 * day + 1 * hour),
      duration_seconds: 7,
      latitude: 37.545,
      longitude: 127.046,
      accuracy: 10,
      altitude: 20,
      speed: 0,
      voice_enrichments: [
        {
          pipeline_version: "v1",
          created_at: iso(1 * day + 1 * hour - 10 * 1000),
          intent_type: "EXPENSE",
          summary: "편의점 생수 구매 (휴지통 예시)",
          transcript: "편의점 삼다수 생수 한 병 1,100원 결제.",
          structured_data: {
            amount: 1100,
            currency: "KRW",
            merchant: "GS25",
            category: "편의점",
          },
        },
      ],
      enrichment_status: null,
      recording_corrections: null,
      deleted_at: iso(4 * hour),
    },
  ];

  return samples;
}

/**
 * Creates a pleasant, synthesized 1-second chime audio WAV blob for offline/demo playback.
 */
export function createDemoAudioBlob(): Blob {
  const sampleRate = 8000;
  const numChannels = 1;
  const duration = 1.0;
  const numSamples = sampleRate * duration;
  const buffer = new ArrayBuffer(44 + numSamples * 2);
  const view = new DataView(buffer);

  // RIFF chunk descriptor
  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + numSamples * 2, true);
  writeString(view, 8, "WAVE");

  // fmt sub-chunk
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * 2, true);
  view.setUint16(32, numChannels * 2, true);
  view.setUint16(34, 16, true); // 16-bit

  // data sub-chunk
  writeString(view, 36, "data");
  view.setUint32(40, numSamples * 2, true);

  // Gentle dual harmonic chime with exponential decay
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const decay = Math.exp(-3.5 * t);
    const sample =
      0.35 * Math.sin(2 * Math.PI * 523.25 * t) * decay + // C5
      0.25 * Math.sin(2 * Math.PI * 659.25 * t) * decay; // E5
    const clamped = Math.max(-1, Math.min(1, sample));
    view.setInt16(
      44 + i * 2,
      clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff,
      true,
    );
  }

  return new Blob([buffer], { type: "audio/wav" });
}

function writeString(view: DataView, offset: number, string: string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}
