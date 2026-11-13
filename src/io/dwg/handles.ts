/** AcDb:Handles — 객체 지도(사양 23장): 핸들 → 객체 자료 안의 위치 */
import { HandleMap } from '../../core/handlemap';
import { warn, type DwgSections } from './container/types';
import { crc8 } from './crc';

/** 핸들 → 위치(Map처럼 같은 핸들이 다시 나오면 처음 자리에 나중 위치 — 127차부터 HandleMap) */
export function readObjectMap(sec: DwgSections): HandleMap<number> {
  const data = sec.handles;
  const map = new HandleMap<number>();
  let p = 0;
  let crcBad = 0;
  while (p + 2 <= data.length) {
    const size = (data[p] << 8) | data[p + 1];
    if (size <= 2) break;
    // 구역마다 기준 핸들·위치를 0부터 다시 센다
    let handle = 0;
    let loc = 0;
    const end = Math.min(data.length, p + size);
    let i = p + 2;
    while (i < end) {
      // 핸들 차이: 부호 없는 MC
      let v = 0;
      let mul = 1;
      let b: number;
      do {
        b = data[i++];
        v += (b & 0x7f) * mul;
        mul *= 128;
      } while (b & 0x80 && i < end);
      handle += v;
      // 위치 차이: 부호 있는 MC
      v = 0;
      mul = 1;
      for (;;) {
        b = data[i++];
        if (b & 0x80) {
          v += (b & 0x7f) * mul;
          mul *= 128;
          if (i >= end) break;
        } else {
          v += (b & 0x3f) * mul;
          if (b & 0x40) v = -v;
          break;
        }
      }
      loc += v;
      map.set(handle, loc);
    }
    if (end + 2 <= data.length) {
      const stored = (data[end] << 8) | data[end + 1];
      if (crc8(0xc0c1, data, p, end) !== stored) crcBad++;
    }
    p = end + 2;
  }
  if (crcBad) warn(sec.warnings, 'dwg.crc_mismatch', '객체 지도 CRC가 맞지 않습니다.', { sections: crcBad });
  return map;
}
