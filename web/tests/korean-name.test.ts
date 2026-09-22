import { expect, it } from "vitest";
import { englishPlaceName, romanizeKorean } from "@/features/team-preview/korean-name";

it("romanises Hangul the way Korean signage does", () => {
  expect(romanizeKorean("부산")).toBe("Busan");
  expect(romanizeKorean("경복궁")).toBe("Gyeongbokgung");
  expect(romanizeKorean("한라산")).toBe("Hallasan");
  expect(romanizeKorean("종로")).toBe("Jongno");
  expect(romanizeKorean("독립문")).toBe("Dongnimmun");
  expect(romanizeKorean("해운대")).toBe("Haeundae");
  expect(romanizeKorean("신라")).toBe("Silla");
});

it("says in English what kind of place it is", () => {
  expect(englishPlaceName("사직공원")).toBe("Sajik Park");
  expect(englishPlaceName("해운대해수욕장")).toBe("Haeundae Beach");
  expect(englishPlaceName("국립중앙박물관")).toBe("Gungnipjungang Museum");
  expect(englishPlaceName("자갈치시장")).toBe("Jagalchi Market");
  expect(englishPlaceName("감천문화마을")).toBe("Gamcheon Culture Village");
  expect(englishPlaceName("부산아시아드주경기장")).toBe("Busanasiadeu Main Stadium");
});

it("keeps a one-syllable kind inside the name, as Gyeongbokgung Palace does", () => {
  expect(englishPlaceName("경복궁")).toBe("Gyeongbokgung Palace");
  expect(englishPlaceName("불국사")).toBe("Bulguksa Temple");
  expect(englishPlaceName("금정산")).toBe("Geumjeongsan Mountain");
});

it("leaves a name that is already English alone", () => {
  expect(englishPlaceName("BIFF Square")).toBe("BIFF Square");
  expect(englishPlaceName("X-game")).toBe("X-game");
});
