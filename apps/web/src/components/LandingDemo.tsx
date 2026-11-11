import { useState } from "react";
import { Tab, TabGroup, TabList, TabPanel, TabPanels } from "@headlessui/react";
import {
  ArrowUpRight,
  Check,
  Expand,
  SlidersHorizontal,
  X,
} from "lucide-react";
import {
  Dialog,
  DialogBackdrop,
  DialogPanel,
  DialogTitle,
} from "@headlessui/react";

const views = ["사진 준비", "촬영 설계", "비교·개선"];
const frames = ["전신", "바스트", "디테일"];
const angles = ["눈높이", "로우 앵글", "버드아이"];
const axes = ["빛과 초점", "인물", "소재"];
const scenes = [
  ["/landing/demo-shoot.webp", "앉은 포즈"],
  ["/landing/demo-detail.webp", "가까운 프레임"],
] as const;

export default function LandingDemo() {
  const [step, setStep] = useState(1);
  const [frame, setFrame] = useState("바스트");
  const [angle, setAngle] = useState("로우 앵글");
  const [axis, setAxis] = useState("소재");
  const [image, setImage] = useState("/landing/demo-shoot.webp");
  const [zoom, setZoom] = useState(false);
  const [instruction, setInstruction] = useState(
    "원단의 결은 살리고, 팔과 몸이 닿는 부분의 그림자를 자연스럽게.",
  );
  return (
    <div className="landing-product-demo">
      <TabGroup selectedIndex={step} onChange={setStep}>
        <div className="demo-topbar">
          <span className="demo-product-name">코튼 유틸리티 재킷</span>
          <TabList aria-label="제품 기능 미리보기" className="demo-tabs">
            {views.map((view) => (
              <Tab key={view}>{view}</Tab>
            ))}
          </TabList>
          <span className="demo-indicator">
            <span /> 기능 데모
          </span>
        </div>
        <div className="demo-workspace">
          <div className="demo-photos">
            <figure>
              <div className="demo-photo-wrap">
                <img
                  src="/landing/demo-garment.webp"
                  alt="데모용 올리브 유틸리티 재킷 상품 사진"
                  width="512"
                  height="1024"
                  fetchPriority="high"
                />
              </div>
              <figcaption>
                상품 사진 <span>디테일의 기준</span>
              </figcaption>
            </figure>
            <figure>
              <button
                type="button"
                className="demo-photo-wrap demo-photo-button"
                onClick={() => setZoom(true)}
                aria-label="촬영 장면 예시 확대"
              >
                <img
                  src={image}
                  alt="데모용 성인 모델의 패션 촬영 장면"
                  width="512"
                  height="1024"
                  fetchPriority="high"
                />
                <span className="demo-expand">
                  <Expand size={17} aria-hidden="true" />
                </span>
              </button>
              <figcaption>
                <fieldset
                  className="demo-thumbnails"
                  aria-label="촬영 장면 예시 선택"
                >
                  {scenes.map(([src, label]) => (
                    <button
                      key={src}
                      type="button"
                      aria-label={label}
                      aria-pressed={image === src}
                      onClick={() => setImage(src)}
                    >
                      <img src={src} alt="" width="28" height="34" />
                    </button>
                  ))}
                </fieldset>
                <span>촬영 장면 예시</span>
              </figcaption>
            </figure>
          </div>
          <TabPanels className="demo-inspector">
            <TabPanel>
              <h3>사진마다, 다른 역할.</h3>
              <p>옷의 정보와 촬영의 방향을 나눠서 준비하세요.</p>
              <ol className="demo-reference-list">
                <li>
                  <span>01</span>
                  <div>
                    <strong>상품 사진</strong>
                    <p>정면·후면·디테일, 최대 3장</p>
                  </div>
                  <Check size={15} />
                </li>
                <li>
                  <span>02</span>
                  <div>
                    <strong>촬영 레퍼런스</strong>
                    <p>구도·포즈·빛의 방향</p>
                  </div>
                  <span className="demo-optional">선택</span>
                </li>
                <li>
                  <span>03</span>
                  <div>
                    <strong>인물 참조</strong>
                    <p>동의받은 성인 모델의 인상</p>
                  </div>
                  <span className="demo-optional">선택</span>
                </li>
              </ol>
              <button
                type="button"
                className="demo-next"
                onClick={() => setStep(1)}
              >
                촬영 설계 살펴보기 <ArrowUpRight size={15} />
              </button>
            </TabPanel>
            <TabPanel>
              <h3>장면의 방향을 정하세요.</h3>
              <p>프레임부터 빛까지, 기획을 직접 조정합니다.</p>
              <fieldset className="demo-choice">
                <legend>프레이밍</legend>
                <div>
                  {frames.map((value) => (
                    <button
                      type="button"
                      key={value}
                      aria-pressed={frame === value}
                      onClick={() => setFrame(value)}
                    >
                      {value}
                    </button>
                  ))}
                </div>
              </fieldset>
              <fieldset className="demo-choice">
                <legend>카메라 각도</legend>
                <div>
                  {angles.map((value) => (
                    <button
                      type="button"
                      key={value}
                      aria-pressed={angle === value}
                      onClick={() => setAngle(value)}
                    >
                      {value}
                    </button>
                  ))}
                </div>
              </fieldset>
              <div className="demo-light">
                <SlidersHorizontal size={15} />
                <span>부드러운 측면광 · 차분한 배경</span>
              </div>
              <div className="demo-direction" role="status">
                {frame} 프레임, {angle}.<br />
                선택한 촬영 방향의 예시예요.
              </div>
              <button
                type="button"
                className="demo-next"
                onClick={() => setStep(2)}
              >
                비교·개선 살펴보기 <ArrowUpRight size={15} />
              </button>
            </TabPanel>
            <TabPanel>
              <h3>좋은 컷을, 더 원하는 쪽으로.</h3>
              <p>비교하고, 바꿀 부분을 구체적으로 지정하세요.</p>
              <fieldset className="demo-choice">
                <legend>이번에 다듬을 부분</legend>
                <div>
                  {axes.map((value) => (
                    <button
                      type="button"
                      key={value}
                      aria-pressed={axis === value}
                      onClick={() => setAxis(value)}
                    >
                      {value}
                    </button>
                  ))}
                </div>
              </fieldset>
              <label className="demo-note">
                수정 지시
                <textarea
                  value={instruction}
                  maxLength={300}
                  onChange={(event) => setInstruction(event.target.value)}
                />
              </label>
              <p className="demo-revision-label">
                {axis} 중심으로 한 컷씩 개선
              </p>
              <a href="/studio" className="demo-next">
                내 상품으로 시작하기 <ArrowUpRight size={15} />
              </a>
            </TabPanel>
          </TabPanels>
        </div>
      </TabGroup>
      <Dialog open={zoom} onClose={setZoom} className="fixed inset-0 z-[70]">
        <DialogBackdrop className="fixed inset-0 bg-overlay/90" />
        <DialogPanel className="fixed inset-3 flex items-center justify-center sm:inset-6">
          <DialogTitle className="sr-only">데모 촬영 장면 확대</DialogTitle>
          <img
            src={image}
            alt="확대한 데모용 패션 촬영 장면"
            className="size-full object-contain"
          />
          <button
            type="button"
            onClick={() => setZoom(false)}
            aria-label="데모 확대 닫기"
            className="absolute top-2 right-2 grid size-11 place-items-center rounded-full border border-line bg-surface text-ink hover:bg-elevated"
          >
            <X size={22} />
          </button>
        </DialogPanel>
      </Dialog>
    </div>
  );
}
