import { defineAsyncComponent } from "vue";
import type { RibbonGroup } from "@/types/Ribbon";

/** As duas páginas de vídeo projetam pelas mesmas janelas e preferências. */
export const onlineVideoProjectionGroup: RibbonGroup = {
  id: "online_video_projection",
  title: "ribbon.groups.projection",
  customCategory: defineAsyncComponent(() => import("./components/VideoMonitors.vue")),
};
