// vite.config.js
import { defineConfig } from "file:///C:/Users/hp/OneDrive/Documents/flip-star/Flipstar-web/node_modules/vite/dist/node/index.js";
import react from "file:///C:/Users/hp/OneDrive/Documents/flip-star/Flipstar-web/node_modules/@vitejs/plugin-react/dist/index.js";
import { copyFileSync, existsSync, readFileSync, writeFileSync } from "fs";
import { resolve } from "path";
var __vite_injected_original_dirname = "C:\\Users\\hp\\OneDrive\\Documents\\flip-star\\Flipstar-web";
function selfContainedHtmlForWebview() {
  return {
    name: "self-contained-html-for-webview",
    closeBundle() {
      const htmlPath = resolve(__vite_injected_original_dirname, "dist", "index.html");
      const jsPath = resolve(__vite_injected_original_dirname, "dist", "assets", "index.js");
      if (!existsSync(htmlPath))
        return;
      let html = readFileSync(htmlPath, "utf-8").replace(/\s+type="module"/g, "").replace(/\s+crossorigin(?:="[^"]*")?/g, "");
      if (existsSync(jsPath)) {
        const js = readFileSync(jsPath, "utf-8").replace(
          /<\/script>/gi,
          "<\\/script>"
        );
        html = html.replace(
          /<script[^>]*src="[^"]*assets\/index\.js"[^>]*><\/script>/i,
          () => "<script>\n" + js + "\n</script>"
        );
      }
      writeFileSync(htmlPath, html);
    }
  };
}
function copyMacleConfigs() {
  const files = [
    "app-config.json",
    "project.config.json",
    "app.json",
    "index.maml",
    "index.js",
    "index.json"
  ];
  return {
    name: "copy-macle-configs",
    closeBundle() {
      for (const f of files) {
        const src = resolve(__vite_injected_original_dirname, f);
        if (existsSync(src)) {
          copyFileSync(src, resolve(__vite_injected_original_dirname, "dist", f));
        }
      }
    }
  };
}
var vite_config_default = defineConfig({
  base: "./",
  plugins: [react(), selfContainedHtmlForWebview(), copyMacleConfigs()],
  publicDir: "public",
  server: {
    port: 5173,
    open: true
  },
  build: {
    outDir: "dist",
    assetsDir: "assets",
    sourcemap: false,
    minify: "terser",
    cssCodeSplit: true,
    cssMinify: true,
    reportCompressedSize: false,
    target: "es2015",
    rollupOptions: {
      output: {
        format: "iife",
        entryFileNames: "assets/[name].js",
        chunkFileNames: "assets/[name].js",
        assetFileNames: "assets/[name].[ext]"
      }
    },
    terserOptions: {
      compress: {
        drop_console: process.env.NODE_ENV === "production",
        drop_debugger: process.env.NODE_ENV === "production",
        pure_funcs: [],
        passes: 1
      },
      mangle: false,
      format: {
        comments: false
      }
    },
    chunkSizeWarningLimit: 600
  },
  // Pre-bundle critical deps for faster dev & prod loads
  optimizeDeps: {
    include: ["react", "react-dom", "lucide-react"]
  }
});
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcuanMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCJDOlxcXFxVc2Vyc1xcXFxocFxcXFxPbmVEcml2ZVxcXFxEb2N1bWVudHNcXFxcZmxpcC1zdGFyXFxcXEZsaXBzdGFyLXdlYlwiO2NvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9maWxlbmFtZSA9IFwiQzpcXFxcVXNlcnNcXFxcaHBcXFxcT25lRHJpdmVcXFxcRG9jdW1lbnRzXFxcXGZsaXAtc3RhclxcXFxGbGlwc3Rhci13ZWJcXFxcdml0ZS5jb25maWcuanNcIjtjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfaW1wb3J0X21ldGFfdXJsID0gXCJmaWxlOi8vL0M6L1VzZXJzL2hwL09uZURyaXZlL0RvY3VtZW50cy9mbGlwLXN0YXIvRmxpcHN0YXItd2ViL3ZpdGUuY29uZmlnLmpzXCI7aW1wb3J0IHsgZGVmaW5lQ29uZmlnIH0gZnJvbSAndml0ZSc7XHJcbmltcG9ydCByZWFjdCBmcm9tICdAdml0ZWpzL3BsdWdpbi1yZWFjdCc7XHJcbmltcG9ydCB7IGNvcHlGaWxlU3luYywgZXhpc3RzU3luYywgcmVhZEZpbGVTeW5jLCB3cml0ZUZpbGVTeW5jIH0gZnJvbSAnZnMnO1xyXG5pbXBvcnQgeyByZXNvbHZlIH0gZnJvbSAncGF0aCc7XHJcblxyXG4vLyBUaGUgbWluaS1wcm9ncmFtIHdlYi12aWV3IGxvYWRzIGluZGV4Lmh0bWwgZnJvbSB0aGUgbG9jYWwgcGFja2FnZSwgYnV0XHJcbi8vIE1hY2xlIGRvZXMgTk9UIHNlcnZlIHRoZSBzaWJsaW5nIGFzc2V0cy8gZGlyZWN0b3J5LCBzbyBhbiBleHRlcm5hbFxyXG4vLyA8c2NyaXB0IHNyYz1cIi4vYXNzZXRzL2luZGV4LmpzXCI+IDQwNHMgYW5kIFJlYWN0IG5ldmVyIG1vdW50cyAoYmxhbmsgcGFnZSkuXHJcbi8vIEZpeDogcHJvZHVjZSBhIHNlbGYtY29udGFpbmVkIGluZGV4Lmh0bWwgYnkgKDEpIGRvd25ncmFkaW5nIHRoZSBFUyBtb2R1bGVcclxuLy8gZW50cnkgdG8gYSBjbGFzc2ljIHNjcmlwdCAoSUlGRSBidW5kbGUpIGFuZCAoMikgaW5saW5pbmcgdGhlIGJ1bmRsZSBzb1xyXG4vLyB0aGVyZSBhcmUgbm8gZXh0ZXJuYWwgYXNzZXQgcmVxdWVzdHMgYXQgYWxsLlxyXG5mdW5jdGlvbiBzZWxmQ29udGFpbmVkSHRtbEZvcldlYnZpZXcoKSB7XHJcbiAgcmV0dXJuIHtcclxuICAgIG5hbWU6ICdzZWxmLWNvbnRhaW5lZC1odG1sLWZvci13ZWJ2aWV3JyxcclxuICAgIGNsb3NlQnVuZGxlKCkge1xyXG4gICAgICBjb25zdCBodG1sUGF0aCA9IHJlc29sdmUoX19kaXJuYW1lLCAnZGlzdCcsICdpbmRleC5odG1sJyk7XHJcbiAgICAgIGNvbnN0IGpzUGF0aCA9IHJlc29sdmUoX19kaXJuYW1lLCAnZGlzdCcsICdhc3NldHMnLCAnaW5kZXguanMnKTtcclxuICAgICAgaWYgKCFleGlzdHNTeW5jKGh0bWxQYXRoKSkgcmV0dXJuO1xyXG4gICAgICBsZXQgaHRtbCA9IHJlYWRGaWxlU3luYyhodG1sUGF0aCwgJ3V0Zi04JylcclxuICAgICAgICAucmVwbGFjZSgvXFxzK3R5cGU9XCJtb2R1bGVcIi9nLCAnJylcclxuICAgICAgICAucmVwbGFjZSgvXFxzK2Nyb3Nzb3JpZ2luKD86PVwiW15cIl0qXCIpPy9nLCAnJyk7XHJcbiAgICAgIGlmIChleGlzdHNTeW5jKGpzUGF0aCkpIHtcclxuICAgICAgICAvLyBFc2NhcGUgYW55IFwiPC9zY3JpcHQ+XCIgb2NjdXJyZW5jZXMgc28gdGhleSBkb24ndCB0ZXJtaW5hdGUgdGhlIHRhZy5cclxuICAgICAgICBjb25zdCBqcyA9IHJlYWRGaWxlU3luYyhqc1BhdGgsICd1dGYtOCcpLnJlcGxhY2UoXHJcbiAgICAgICAgICAvPFxcL3NjcmlwdD4vZ2ksXHJcbiAgICAgICAgICAnPFxcXFwvc2NyaXB0PicsXHJcbiAgICAgICAgKTtcclxuICAgICAgICBodG1sID0gaHRtbC5yZXBsYWNlKFxyXG4gICAgICAgICAgLzxzY3JpcHRbXj5dKnNyYz1cIlteXCJdKmFzc2V0c1xcL2luZGV4XFwuanNcIltePl0qPjxcXC9zY3JpcHQ+L2ksXHJcbiAgICAgICAgICAoKSA9PiAnPHNjcmlwdD5cXG4nICsganMgKyAnXFxuPC9zY3JpcHQ+JyxcclxuICAgICAgICApO1xyXG4gICAgICB9XHJcbiAgICAgIHdyaXRlRmlsZVN5bmMoaHRtbFBhdGgsIGh0bWwpO1xyXG4gICAgfSxcclxuICB9O1xyXG59XHJcblxyXG4vLyBDb3B5IE1hY2xlL21pbmktcHJvZ3JhbSBjb25maWcgZmlsZXMgaW50byB0aGUgYnVpbGQgb3V0cHV0IHNvIHRoZVxyXG4vLyBzaW11bGF0b3IgKHdoaWNoIHNlcnZlcyBmcm9tIGRpc3QvKSBjYW4gZmluZCB0aGVtIGFuZCBub3QgNDA0LlxyXG5mdW5jdGlvbiBjb3B5TWFjbGVDb25maWdzKCkge1xyXG4gIGNvbnN0IGZpbGVzID0gW1xyXG4gICAgJ2FwcC1jb25maWcuanNvbicsXHJcbiAgICAncHJvamVjdC5jb25maWcuanNvbicsXHJcbiAgICAnYXBwLmpzb24nLFxyXG4gICAgJ2luZGV4Lm1hbWwnLFxyXG4gICAgJ2luZGV4LmpzJyxcclxuICAgICdpbmRleC5qc29uJyxcclxuICBdO1xyXG4gIHJldHVybiB7XHJcbiAgICBuYW1lOiAnY29weS1tYWNsZS1jb25maWdzJyxcclxuICAgIGNsb3NlQnVuZGxlKCkge1xyXG4gICAgICBmb3IgKGNvbnN0IGYgb2YgZmlsZXMpIHtcclxuICAgICAgICBjb25zdCBzcmMgPSByZXNvbHZlKF9fZGlybmFtZSwgZik7XHJcbiAgICAgICAgaWYgKGV4aXN0c1N5bmMoc3JjKSkge1xyXG4gICAgICAgICAgY29weUZpbGVTeW5jKHNyYywgcmVzb2x2ZShfX2Rpcm5hbWUsICdkaXN0JywgZikpO1xyXG4gICAgICAgIH1cclxuICAgICAgfVxyXG4gICAgfSxcclxuICB9O1xyXG59XHJcblxyXG5leHBvcnQgZGVmYXVsdCBkZWZpbmVDb25maWcoe1xyXG4gIGJhc2U6ICcuLycsXHJcbiAgcGx1Z2luczogW3JlYWN0KCksIHNlbGZDb250YWluZWRIdG1sRm9yV2VidmlldygpLCBjb3B5TWFjbGVDb25maWdzKCldLFxyXG4gIHB1YmxpY0RpcjogJ3B1YmxpYycsXHJcbiAgc2VydmVyOiB7XHJcbiAgICBwb3J0OiA1MTczLFxyXG4gICAgb3BlbjogdHJ1ZSxcclxuICB9LFxyXG4gIGJ1aWxkOiB7XHJcbiAgICBvdXREaXI6ICdkaXN0JyxcclxuICAgIGFzc2V0c0RpcjogJ2Fzc2V0cycsXHJcbiAgICBzb3VyY2VtYXA6IGZhbHNlLFxyXG4gICAgbWluaWZ5OiAndGVyc2VyJyxcclxuICAgIGNzc0NvZGVTcGxpdDogdHJ1ZSxcclxuICAgIGNzc01pbmlmeTogdHJ1ZSxcclxuICAgIHJlcG9ydENvbXByZXNzZWRTaXplOiBmYWxzZSxcclxuICAgIHRhcmdldDogJ2VzMjAxNScsXHJcbiAgICByb2xsdXBPcHRpb25zOiB7XHJcbiAgICAgIG91dHB1dDoge1xyXG4gICAgICAgIGZvcm1hdDogJ2lpZmUnLFxyXG4gICAgICAgIGVudHJ5RmlsZU5hbWVzOiAnYXNzZXRzL1tuYW1lXS5qcycsXHJcbiAgICAgICAgY2h1bmtGaWxlTmFtZXM6ICdhc3NldHMvW25hbWVdLmpzJyxcclxuICAgICAgICBhc3NldEZpbGVOYW1lczogJ2Fzc2V0cy9bbmFtZV0uW2V4dF0nLFxyXG4gICAgICB9LFxyXG4gICAgfSxcclxuICAgIHRlcnNlck9wdGlvbnM6IHtcclxuICAgICAgY29tcHJlc3M6IHtcclxuICAgICAgICBkcm9wX2NvbnNvbGU6IHByb2Nlc3MuZW52Lk5PREVfRU5WID09PSAncHJvZHVjdGlvbicsXHJcbiAgICAgICAgZHJvcF9kZWJ1Z2dlcjogcHJvY2Vzcy5lbnYuTk9ERV9FTlYgPT09ICdwcm9kdWN0aW9uJyxcclxuICAgICAgICBwdXJlX2Z1bmNzOiBbXSxcclxuICAgICAgICBwYXNzZXM6IDEsXHJcbiAgICAgIH0sXHJcbiAgICAgIG1hbmdsZTogZmFsc2UsXHJcbiAgICAgIGZvcm1hdDoge1xyXG4gICAgICAgIGNvbW1lbnRzOiBmYWxzZSxcclxuICAgICAgfSxcclxuICAgIH0sXHJcbiAgICBjaHVua1NpemVXYXJuaW5nTGltaXQ6IDYwMCxcclxuICB9LFxyXG4gIC8vIFByZS1idW5kbGUgY3JpdGljYWwgZGVwcyBmb3IgZmFzdGVyIGRldiAmIHByb2QgbG9hZHNcclxuICBvcHRpbWl6ZURlcHM6IHtcclxuICAgIGluY2x1ZGU6IFsncmVhY3QnLCAncmVhY3QtZG9tJywgJ2x1Y2lkZS1yZWFjdCddLFxyXG4gIH0sXHJcbn0pO1xyXG4iXSwKICAibWFwcGluZ3MiOiAiO0FBQStWLFNBQVMsb0JBQW9CO0FBQzVYLE9BQU8sV0FBVztBQUNsQixTQUFTLGNBQWMsWUFBWSxjQUFjLHFCQUFxQjtBQUN0RSxTQUFTLGVBQWU7QUFIeEIsSUFBTSxtQ0FBbUM7QUFXekMsU0FBUyw4QkFBOEI7QUFDckMsU0FBTztBQUFBLElBQ0wsTUFBTTtBQUFBLElBQ04sY0FBYztBQUNaLFlBQU0sV0FBVyxRQUFRLGtDQUFXLFFBQVEsWUFBWTtBQUN4RCxZQUFNLFNBQVMsUUFBUSxrQ0FBVyxRQUFRLFVBQVUsVUFBVTtBQUM5RCxVQUFJLENBQUMsV0FBVyxRQUFRO0FBQUc7QUFDM0IsVUFBSSxPQUFPLGFBQWEsVUFBVSxPQUFPLEVBQ3RDLFFBQVEscUJBQXFCLEVBQUUsRUFDL0IsUUFBUSxnQ0FBZ0MsRUFBRTtBQUM3QyxVQUFJLFdBQVcsTUFBTSxHQUFHO0FBRXRCLGNBQU0sS0FBSyxhQUFhLFFBQVEsT0FBTyxFQUFFO0FBQUEsVUFDdkM7QUFBQSxVQUNBO0FBQUEsUUFDRjtBQUNBLGVBQU8sS0FBSztBQUFBLFVBQ1Y7QUFBQSxVQUNBLE1BQU0sZUFBZSxLQUFLO0FBQUEsUUFDNUI7QUFBQSxNQUNGO0FBQ0Esb0JBQWMsVUFBVSxJQUFJO0FBQUEsSUFDOUI7QUFBQSxFQUNGO0FBQ0Y7QUFJQSxTQUFTLG1CQUFtQjtBQUMxQixRQUFNLFFBQVE7QUFBQSxJQUNaO0FBQUEsSUFDQTtBQUFBLElBQ0E7QUFBQSxJQUNBO0FBQUEsSUFDQTtBQUFBLElBQ0E7QUFBQSxFQUNGO0FBQ0EsU0FBTztBQUFBLElBQ0wsTUFBTTtBQUFBLElBQ04sY0FBYztBQUNaLGlCQUFXLEtBQUssT0FBTztBQUNyQixjQUFNLE1BQU0sUUFBUSxrQ0FBVyxDQUFDO0FBQ2hDLFlBQUksV0FBVyxHQUFHLEdBQUc7QUFDbkIsdUJBQWEsS0FBSyxRQUFRLGtDQUFXLFFBQVEsQ0FBQyxDQUFDO0FBQUEsUUFDakQ7QUFBQSxNQUNGO0FBQUEsSUFDRjtBQUFBLEVBQ0Y7QUFDRjtBQUVBLElBQU8sc0JBQVEsYUFBYTtBQUFBLEVBQzFCLE1BQU07QUFBQSxFQUNOLFNBQVMsQ0FBQyxNQUFNLEdBQUcsNEJBQTRCLEdBQUcsaUJBQWlCLENBQUM7QUFBQSxFQUNwRSxXQUFXO0FBQUEsRUFDWCxRQUFRO0FBQUEsSUFDTixNQUFNO0FBQUEsSUFDTixNQUFNO0FBQUEsRUFDUjtBQUFBLEVBQ0EsT0FBTztBQUFBLElBQ0wsUUFBUTtBQUFBLElBQ1IsV0FBVztBQUFBLElBQ1gsV0FBVztBQUFBLElBQ1gsUUFBUTtBQUFBLElBQ1IsY0FBYztBQUFBLElBQ2QsV0FBVztBQUFBLElBQ1gsc0JBQXNCO0FBQUEsSUFDdEIsUUFBUTtBQUFBLElBQ1IsZUFBZTtBQUFBLE1BQ2IsUUFBUTtBQUFBLFFBQ04sUUFBUTtBQUFBLFFBQ1IsZ0JBQWdCO0FBQUEsUUFDaEIsZ0JBQWdCO0FBQUEsUUFDaEIsZ0JBQWdCO0FBQUEsTUFDbEI7QUFBQSxJQUNGO0FBQUEsSUFDQSxlQUFlO0FBQUEsTUFDYixVQUFVO0FBQUEsUUFDUixjQUFjLFFBQVEsSUFBSSxhQUFhO0FBQUEsUUFDdkMsZUFBZSxRQUFRLElBQUksYUFBYTtBQUFBLFFBQ3hDLFlBQVksQ0FBQztBQUFBLFFBQ2IsUUFBUTtBQUFBLE1BQ1Y7QUFBQSxNQUNBLFFBQVE7QUFBQSxNQUNSLFFBQVE7QUFBQSxRQUNOLFVBQVU7QUFBQSxNQUNaO0FBQUEsSUFDRjtBQUFBLElBQ0EsdUJBQXVCO0FBQUEsRUFDekI7QUFBQTtBQUFBLEVBRUEsY0FBYztBQUFBLElBQ1osU0FBUyxDQUFDLFNBQVMsYUFBYSxjQUFjO0FBQUEsRUFDaEQ7QUFDRixDQUFDOyIsCiAgIm5hbWVzIjogW10KfQo=
