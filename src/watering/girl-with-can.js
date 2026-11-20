// 水やり演出中の女の子（マップの女の子＝おかっぱ・赤い服に、じょうろを持たせた絵）
// ドット絵のスプライト（歩き・持ち上げ・傾けの各コマ、4 方向）ができたら、この関数だけ差し替える。
// footX/footY は足元中心（ワールド座標）。s は WateringAnimation の state。
// 戻り値は注ぎ口の先端（ワールド座標）。anim.setSpout() にそのまま渡す。
import { WATERING_STYLE } from './watering-animation.js';

const H = '#4a3a2e', SK = '#f4d6b6', DRESS = '#d4604f', SHOE = '#6b4a36';
const CAN = '#8fb3c4', CAN_DARK = '#7aa2b5';

function ell(ctx, x, y, rx, ry, c) { ctx.fillStyle = c; ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); ctx.fill(); }

export function drawGirlWithCan(ctx, footX, footY, s) {
  // up/down 向きは、いまのマップの女の子と同じく左右の絵で代用する
  const dir = s.facing === 'left' ? -1 : 1;
  const k = s.walking ? Math.sin(s.walkCycle * Math.PI * 2) : 0;
  const bob = s.walking ? Math.abs(Math.sin(s.walkCycle * Math.PI)) * 1.4 : 0;
  const x = footX, y = footY - 11; // マップの女の子の基準点（体の中心あたり）
  const lift = s.lift * WATERING_STYLE.liftPx;

  // 影・脚・靴（マップの女の子と同じ）
  ell(ctx, x, y + 12, 9, 3.4, 'rgba(120,80,40,.22)');
  ctx.fillStyle = SK;
  ctx.fillRect(x - 3.4, y + 4, 2, 6 - Math.max(0, k) * 1.6);
  ctx.fillRect(x + 1.4, y + 4, 2, 6 - Math.max(0, -k) * 1.6);
  ell(ctx, x - 2.4, y + 10.4 - Math.max(0, k) * 1.6, 2.3, 1.4, SHOE);
  ell(ctx, x + 2.4, y + 10.4 - Math.max(0, -k) * 1.6, 2.3, 1.4, SHOE);
  // 赤い服
  ctx.fillStyle = DRESS;
  ctx.beginPath();
  ctx.moveTo(x - 8, y + 6); ctx.lineTo(x - 4, y - 6 + bob); ctx.lineTo(x + 4, y - 6 + bob); ctx.lineTo(x + 8, y + 6);
  ctx.quadraticCurveTo(x, y + 7.5, x - 8, y + 6); ctx.closePath(); ctx.fill();
  // おかっぱの頭（後ろ髪 → 顔 → 前髪）
  ctx.fillStyle = H; ctx.beginPath(); ctx.roundRect(x - 7.2 - dir * .5, y - 20 + bob, 14.4, 12.5, [7, 7, 1.5, 1.5]); ctx.fill();
  ell(ctx, x + dir * 1.3, y - 12.2 + bob, 4.9, 5, SK);
  ctx.fillStyle = H; ctx.beginPath(); ctx.roundRect(x - 7.2 - dir * .5, y - 20 + bob, 14.4, 5.6, [7, 7, 0, 0]); ctx.fill();
  ell(ctx, x + dir * 3.2, y - 11.6 + bob, .9, 1.1, '#3e3026');

  // 腕とじょうろ（左右は scale で反転）
  ctx.save();
  ctx.translate(x, 0);
  ctx.scale(dir, 1);
  const hx = 7, hy = y - lift; // 手の位置
  ctx.strokeStyle = SK; ctx.lineWidth = 2.2; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(2.5, y - 4 + bob); ctx.lineTo(hx, hy); ctx.stroke();
  const cx = hx + 4, cy = hy + 2; // じょうろの持ち手のあたりを中心に傾ける
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(s.tilt);
  ctx.fillStyle = CAN; ctx.beginPath(); ctx.roundRect(-3, -3, 9, 8, 1.6); ctx.fill();
  ctx.fillStyle = CAN_DARK; ctx.fillRect(-3.4, -3.6, 9.8, 1.6);
  ctx.strokeStyle = CAN_DARK; ctx.lineWidth = 1.3;
  ctx.beginPath(); ctx.arc(1.5, -3.4, 3, Math.PI, 0); ctx.stroke(); // 持ち手
  ctx.lineWidth = 1.8; ctx.beginPath(); ctx.moveTo(5.5, 0); ctx.lineTo(12, -4.5); ctx.stroke(); // 注ぎ口
  ell(ctx, 12.4, -4.8, 1.5, 1, CAN_DARK);
  ctx.restore();
  ctx.restore();

  // 注ぎ口の先端（ローカル (12.4,-4.8) を傾けて、ワールド座標へ）
  const lx = 12.4 * Math.cos(s.tilt) + 4.8 * Math.sin(s.tilt);
  const ly = 12.4 * Math.sin(s.tilt) - 4.8 * Math.cos(s.tilt);
  return { x: x + dir * (cx + lx), y: cy + ly };
}
