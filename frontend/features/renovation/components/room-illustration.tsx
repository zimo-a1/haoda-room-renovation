/** 原创矢量空间示意，不是模型效果或用户照片。 */
export function RoomIllustration() {
  return (
    <svg viewBox="0 0 760 620" fill="none" className="room-illustration" aria-hidden="true">
      <defs>
        <linearGradient id="wall" x1="180" y1="20" x2="660" y2="500" gradientUnits="userSpaceOnUse"><stop stopColor="#eeeadf" /><stop offset="1" stopColor="#d8d2c2" /></linearGradient>
        <linearGradient id="floor" x1="380" y1="370" x2="380" y2="620" gradientUnits="userSpaceOnUse"><stop stopColor="#cbbb9f" /><stop offset="1" stopColor="#e3d7c3" /></linearGradient>
        <linearGradient id="sun" x1="554" y1="260" x2="184" y2="530" gradientUnits="userSpaceOnUse"><stop stopColor="#fff9dd" stopOpacity=".64" /><stop offset="1" stopColor="#fff9dd" stopOpacity="0" /></linearGradient>
        <linearGradient id="sofa" x1="198" y1="330" x2="215" y2="444" gradientUnits="userSpaceOnUse"><stop stopColor="#a4ad94" /><stop offset="1" stopColor="#89977b" /></linearGradient>
        <pattern id="weave" patternUnits="userSpaceOnUse" width="6" height="6"><path d="M0 1h6M1 0v6" stroke="#827967" strokeOpacity=".12" strokeWidth=".6" /></pattern>
        <filter id="grain"><feTurbulence type="fractalNoise" baseFrequency=".6" numOctaves="3" stitchTiles="stitch" /><feColorMatrix type="saturate" values="0" /><feComponentTransfer><feFuncA type="linear" slope=".05" /></feComponentTransfer><feBlend in="SourceGraphic" mode="multiply" /></filter>
      </defs>
      <g filter="url(#grain)">
        <path fill="url(#wall)" d="M0 0h760v409H0z" /><path fill="url(#floor)" d="M0 399h760v221H0z" />
        <path d="M0 398h760" stroke="#c9c1b1" strokeWidth="9" /><path d="M30 620 195 403M262 620l69-217M520 620l-38-217M760 566 602 403" stroke="#b6a488" strokeOpacity=".4" />
        <path d="m517 159 146 30-72 231-373 119H94z" fill="url(#sun)" />
        <path d="M504 34h162v288H504z" fill="#c6bca8" /><path d="M514 43h142v271H514z" fill="#c8d1bd" /><path d="M515 216c41-40 77-18 141-71v169H515z" fill="#b9c5aa" /><path d="M521 46h60v264h-60zM589 46h60v264h-60z" stroke="#f6f0e5" strokeWidth="8" /><path d="M515 165h143" stroke="#f6f0e5" strokeWidth="7" />
        <path d="M489 28c-8 75-4 219-18 306 17 9 29 7 44 0-14-112-14-210-8-306zM662 28c11 88 10 220 24 306-15 10-27 8-41 0 14-92 15-213 7-306z" fill="#e9e3d6" /><path d="M478 27h198" stroke="#958a74" strokeWidth="4" strokeLinecap="round" />
        <path d="M245 104h112v137H245z" fill="#a89475" /><path d="M253 112h96v121h-96z" fill="#eee8dc" /><path d="M270 212v-43a31 31 0 0 1 62 0v43z" fill="#bba082" /><path d="M281 212v-33a20 20 0 0 1 40 0v33z" fill="#d6c5ad" /><circle cx="316" cy="141" r="12" fill="#86927b" />
        <ellipse cx="376" cy="491" rx="249" ry="66" fill="#b2a68d" fillOpacity=".19" /><path d="m196 437 355-2 128 115-478 22-99-51z" fill="#e6dfd0" /><path d="m196 437 355-2 128 115-478 22-99-51z" fill="url(#weave)" /><path d="m176 463 401-8M159 479l438-8M143 496l470-7M137 513l495-7M163 529l488-8" stroke="#c7bda8" strokeWidth="2" />
        <ellipse cx="285" cy="445" rx="170" ry="26" fill="#7c715b" fillOpacity=".2" />
        <path d="m145 431-3 32m252-32 5 29" stroke="#70624c" strokeWidth="9" strokeLinecap="round" />
        <rect x="140" y="307" width="266" height="119" rx="26" fill="url(#sofa)" /><path d="M272 320v77" stroke="#7e8d70" strokeWidth="2" /><rect x="139" y="390" width="265" height="50" rx="17" fill="#94a085" /><rect x="118" y="366" width="43" height="71" rx="16" fill="#a4af95" /><rect x="386" y="364" width="43" height="72" rx="16" fill="#9ba78b" /><path d="M164 413h218" stroke="#78886e" strokeWidth="2" />
        <path d="m163 335 50-9 17 64-52 8z" fill="#e4d4b9" /><path d="m178 333 16 62m-2-65 16 62" stroke="#c0aa8a" strokeWidth="3" /><path d="m322 329 47 13-15 54-48-13z" fill="#cebb99" /><path d="m339 335-15 52" stroke="#dacbb0" strokeWidth="16" />
        <path d="m347 469-4 64m109-63 8 62" stroke="#8c6f50" strokeWidth="9" strokeLinecap="round" /><ellipse cx="401" cy="470" rx="81" ry="28" fill="#a68965" /><ellipse cx="401" cy="463" rx="81" ry="26" fill="#c3a581" />
        <path d="m377 452 35-8 24 10-35 9z" fill="#f2e9d7" /><path d="m377 455 24 9 35-8" stroke="#ddd0b8" strokeWidth="4" /><ellipse cx="376" cy="454" rx="10" ry="4" fill="#baa084" /><path d="M369 432h14l-2 20h-10z" fill="#7c896e" /><path d="M376 433v-23m0 12-11-11m11 4 9-12" stroke="#778765" strokeWidth="2" />
        <path d="M110 211v219" stroke="#5e604e" strokeWidth="5" /><ellipse cx="110" cy="433" rx="26" ry="6" fill="#777969" /><path d="M90 184h40l22 55H68z" fill="#f2e5c6" /><ellipse cx="110" cy="239" rx="42" ry="8" fill="#d6c7a6" /><path d="M97 186 88 234m35-48 9 48" stroke="#d6c7a6" />
        <path d="m579 450 27-12 3 25-28 12z" fill="#c9b9a0" /><path d="M594 436v-95m0 30-22-35m22 19 21-47m-21 98 32-45" stroke="#708364" strokeWidth="4" /><ellipse cx="565" cy="328" rx="14" ry="33" transform="rotate(-32 565 328)" fill="#879573" /><ellipse cx="616" cy="303" rx="16" ry="35" transform="rotate(25 616 303)" fill="#8c9c7b" /><ellipse cx="628" cy="354" rx="16" ry="35" transform="rotate(41 628 354)" fill="#6f855f" /><ellipse cx="585" cy="299" rx="13" ry="31" transform="rotate(-9 585 299)" fill="#748663" /><path d="M568 410h53l-9 55h-35z" fill="#b29476" /><ellipse cx="594" cy="410" rx="27" ry="7" fill="#8b755c" /><path d="M574 422h40m-37 12h36m-34 12h32" stroke="#c1a68a" strokeWidth="2" />
      </g>
    </svg>
  );
}
