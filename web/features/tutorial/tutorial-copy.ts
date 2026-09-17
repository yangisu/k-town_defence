import type { TutorialStepId } from "@/features/tutorial/tutorial-config";
import type { Locale } from "@/features/team-preview/types";

export const tutorialCopy: Record<Locale, Record<TutorialStepId, { title: string; body: string }>> = {
  ko: {
    "choose-fandom": { title: "함께 여행할 팬덤을 선택하세요", body: "선택한 팬덤에 맞춰 영토와 원정을 추천합니다." },
    "open-territory": { title: "추천 영토를 확인하세요", body: "추천 영토를 선택하면 해당 지역의 원정과 방문 장소를 확인할 수 있습니다." },
    "start-expedition": { title: "원정을 시작하세요", body: "원정을 시작하면 방문할 장소와 예상 포인트를 확인할 수 있습니다." },
    "open-checkin": { title: "첫 장소에서 체크인하세요", body: "장소에 도착한 뒤 위치와 현장 사진으로 방문을 인증합니다." },
  },
  en: {
    "choose-fandom": { title: "Choose your fandom", body: "Your choice shapes the territories and expeditions we recommend." },
    "open-territory": { title: "Review the recommended territory", body: "Select it to see the expedition and places to visit in that area." },
    "start-expedition": { title: "Start the expedition", body: "See the places to visit and the points you can earn." },
    "open-checkin": { title: "Check in at the first stop", body: "When you arrive, verify your visit with location and an on-site photo." },
  },
};