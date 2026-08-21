"use client";

import { useCallback, useEffect, useState } from "react";
import type { LiveExpedition, OpenDataStatus, Place, TourismService } from "@/lib/domain";
import { StateMessage } from "@/components/ui/state-message";


function publicCopy(value: string): string {
  return value.replaceAll("한국관광공사", "공공 관광데이터").replace(/\bKTO\b/g, "관광 데이터");
}

function formattedTime(value?: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("ko-KR", {
    month: "long", day: "numeric", hour: "2-digit", minute: "2-digit",
  }).format(date);
}

function seoulDate(value: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(value);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

const systemNow = () => new Date();

export function LiveExpeditionPanel({
  service,
  onStartCheckIn,
  now = systemNow,
}: {
  service: TourismService;
  onStartCheckIn: (place: Place) => void;
  now?: () => Date;
}) {
  const [keyword, setKeyword] = useState("BTS");
  const [submittedKeyword, setSubmittedKeyword] = useState("BTS");
  const [expedition, setExpedition] = useState<LiveExpedition | null>(null);
  const [dataStatus, setDataStatus] = useState<OpenDataStatus | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [attempt, setAttempt] = useState(0);

  const load = useCallback(async () => {
    try {
      const [nextExpedition, nextStatus] = await Promise.all([
        service.getRecommendedExpedition({
          regionCode: "6",
          keyword: submittedKeyword || undefined,
          travelDate: seoulDate(now()),
          limit: 5,
        }),
        service.getOpenDataStatus(),
      ]);
      setExpedition(nextExpedition);
      setDataStatus(nextStatus);
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }, [now, service, submittedKeyword]);

  useEffect(() => {
    const timeout = setTimeout(() => { void load(); }, 0);
    return () => clearTimeout(timeout);
  }, [load, attempt]);

  return (
    <section className="live-expedition" aria-labelledby="live-expedition-title">
      <div className="live-expedition-heading">
        <div>
          <span className="eyebrow">OPEN DATA EXPEDITION</span>
          <h2 id="live-expedition-title">{expedition?.title ?? "부산 로컬 원정"}</h2>
          <p>K-콘텐츠 관심지에서 부산의 문화·먹거리·행사로 이어지는 실제 여행 경로예요.</p>
        </div>
        {dataStatus ? (
          <div className="open-data-status" aria-label="관광 데이터 갱신 상태">
            <strong>{dataStatus.label} · {dataStatus.operations.length}개 기능 연동</strong>
            <span>활성 관광지 {dataStatus.activePlaceCount}곳</span>
            <ul className="open-data-operations" aria-label="연동된 관광 데이터 기능">
              {dataStatus.operations.map((operation) => (
                <li key={operation.operation}>{operation.operation} · {operation.responseCount}건</li>
              ))}
            </ul>
            {formattedTime(dataStatus.lastSuccessfulSyncAt) ? (
              <small><time dateTime={dataStatus.lastSuccessfulSyncAt}>{formattedTime(dataStatus.lastSuccessfulSyncAt)}</time> 갱신</small>
            ) : null}
          </div>
        ) : null}
      </div>

      <form className="expedition-search" onSubmit={(event) => {
        event.preventDefault();
        setStatus("loading");
        setSubmittedKeyword(keyword.trim());
        setAttempt((value) => value + 1);
      }}>
        <label htmlFor="expedition-keyword">관심 K-콘텐츠 키워드</label>
        <div><input id="expedition-keyword" value={keyword} onChange={(event) => setKeyword(event.target.value)} maxLength={100} /><button type="submit">원정 다시 만들기</button></div>
      </form>

      {status === "loading" ? <div className="panel-loading" role="status">실제 관광데이터로 원정을 만들고 있어요.</div> : null}
      {status === "error" ? (
        <StateMessage tone="warning" title="지역 원정을 만들지 못했어요">
          <button onClick={() => { setStatus("loading"); setAttempt((value) => value + 1); }}>다시 시도</button>
        </StateMessage>
      ) : null}
      {status === "ready" && expedition?.stops.length === 0 ? <p className="empty-message">조건에 맞는 원정 정거장이 없습니다.</p> : null}

      {status === "ready" && expedition ? (
        <ol className="live-expedition-stops">
          {expedition.stops.map((stop) => {
            const place = stop.place;
            const image = place.imageUrls?.[0] ?? place.imageUrl;
            return (
              <li key={place.id}>
                <article className="live-expedition-stop">
                  <div className="stop-order"><span>{String(stop.order).padStart(2, "0")}</span><small>{stop.distanceKm === 0 ? "시작점" : `${stop.distanceKm.toFixed(1)} km`}</small></div>
                  <div className="stop-visual">
                    {image ? <img src={image} alt="" loading="lazy" width="480" height="280" /* eslint-disable-line @next/next/no-img-element -- vinext does not provide next/image */ /> : <div className="live-place-image-fallback">BUSAN</div>}
                  </div>
                  <div className="stop-detail">
                    <span className="stop-category">{place.categoryLabel}</span>
                    <h3>{publicCopy(place.nameKo)}</h3>
                    <div className="recommendation-reasons" aria-label={`${place.nameKo} 추천 이유`}>{stop.reasons.map((reason) => <span key={reason}>{reason}</span>)}</div>
                    <p>{publicCopy(place.description)}</p>
                    <address>{publicCopy(place.address)}</address>
                    <dl className="tourism-facts">
                      {place.openTime ? <div><dt>이용시간</dt><dd>{publicCopy(place.openTime)}</dd></div> : null}
                      {place.restDate ? <div><dt>쉬는 날</dt><dd>{publicCopy(place.restDate)}</dd></div> : null}
                      {place.parking ? <div><dt>주차</dt><dd>{publicCopy(place.parking)}</dd></div> : null}
                      {place.imageUrls?.length ? <div><dt>관광 이미지</dt><dd>{place.imageUrls.length}장</dd></div> : null}
                    </dl>
                    <button className="checkin-button" onClick={() => onStartCheckIn(place)} aria-label={`${place.nameKo} 체크인`}>현장 체크인</button>
                  </div>
                </article>
              </li>
            );
          })}
        </ol>
      ) : null}
    </section>
  );
}
