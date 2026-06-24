export const CREATIVE_CUE_SELECT_EVENT = "souschef:creative-cue-select";

export type CreativeCueSelectDetail = {
  prompt: string;
};

export function dispatchCreativeCueSelect(prompt: string): void {
  window.dispatchEvent(
    new CustomEvent<CreativeCueSelectDetail>(CREATIVE_CUE_SELECT_EVENT, {
      detail: { prompt },
    })
  );
}
