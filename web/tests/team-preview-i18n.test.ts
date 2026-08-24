import { expect, it } from "vitest";
import { copy } from "@/features/team-preview/i18n";

it("keeps Korean and English key sets identical", () => {
  expect(Object.keys(copy.en).sort()).toEqual(Object.keys(copy.ko).sort());
  expect(copy.ko.navTerritory).toBe("영토 지도");
  expect(copy.en.navTerritory).toBe("Territory Map");
  expect(copy.ko.profileSetupTitle).toBe("응원할 아티스트를 선택하세요");
  expect(copy.en.profileSetupTitle).toBe("Choose an artist to support");
  expect(copy.ko.profileConfirm).toBe("이 팬덤으로 시작");
  expect(copy.en.myFandom).toBe("My fandom");
  expect(copy.ko.fandomRankPosition).toBe("팬덤 순위 {rank}위");
  expect(copy.en.fandomRankPosition).toBe("Fandom rank #{rank}");
});
