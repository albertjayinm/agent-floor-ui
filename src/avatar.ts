import type { Accessory, Agent, HairStyle } from './protocol';

export interface ResolvedAvatar { skin: string; hair: string; hairStyle: HairStyle; accessory: Accessory; pants: string; shoes: string }

const skins = ['#f7d7bd', '#efc19c', '#d9a07a', '#b67a55', '#8a5a3c', '#f2c6a0'];
const hairs = ['#2b2321', '#5b3a26', '#9c5b34', '#d8a24a', '#26313f', '#c2563a', '#3fb8b0'];
const styles: HairStyle[] = ['short', 'long', 'bun', 'cap', 'hood', 'spiky', 'bald'];
const extras: Accessory[] = ['none', 'glasses', 'beard', 'headset', 'none', 'glasses-beard'];
const pants = ['#2f3e4f', '#3b3a46', '#4a5560', '#2d3a35', '#5b4a3f'];
const shoes = ['#2a2f33', '#eef0ec', '#3b2f2a', '#2a2f33'];

// Agent-supplied fields win; missing ones are derived from the id so a character looks the same on every load.
export function resolveAvatar(agent: Agent): ResolvedAvatar {
  let hash = 2166136261;
  for (const char of agent.id) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0;
  const pick = <T>(list: T[], salt: number) => list[Math.floor(hash / 7 ** salt) % list.length];
  return {
    skin: agent.avatar?.skin ?? pick(skins, 0),
    hair: agent.avatar?.hair ?? pick(hairs, 1),
    hairStyle: agent.avatar?.hairStyle ?? pick(styles, 2),
    accessory: agent.avatar?.accessory ?? pick(extras, 3),
    pants: pick(pants, 4),
    shoes: pick(shoes, 5),
  };
}
