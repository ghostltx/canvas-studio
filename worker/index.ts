import handler from "vinext/server/fetch-handler";
import {runWithExecutionContext} from 'vinext/shims/request-context';
import { runWithConnectorBinding } from "../lib/connector-context";
import type { ConnectorBinding } from "../lib/connector-contract.mjs";

const worker = {
  fetch(request: Request, env: Cloudflare.Env, ctx: ExecutionContext<{ CONNECTORS?: ConnectorBinding }>) {
    const pathname=new URL(request.url).pathname;
    const runtimeAsset=pathname.endsWith('/model_q4.onnx')?'model.onnx':/\/ort-wasm-simd-threaded\.asyncify-[^/]+\.wasm$/.test(pathname)?'runtime.wasm':null;
    if(runtimeAsset&&env.BUCKET){
      return env.BUCKET.get(`runtime/${runtimeAsset}`).then(asset=>asset
        ?new Response(asset.body,{headers:{'Content-Type':runtimeAsset.endsWith('.wasm')?'application/wasm':'application/octet-stream','Cache-Control':'public, max-age=86400'}})
        :new Response('Runtime asset is not installed',{status:503}));
    }
    let binding = ctx.props?.CONNECTORS;
    // Local preview emulates the same request-scoped capability. This branch and
    // the auxiliary service binding are absent from production builds.
    if (import.meta.env.DEV && !binding && env.CONNECTORS) {
      const preview = env.CONNECTORS;
      const expiresAt = Date.now() + 60_000;
      binding = {
        async getContext() {
          if (Date.now() >= expiresAt) return { status: "request_context_expired" };
          return preview.getContext?.() ?? { status: "binding_unavailable" };
        },
        async invoke(connectorId, actionName, args) {
          if (Date.now() >= expiresAt) {
            return { status: "request_context_expired", message: "This request has expired. Please try again." };
          }
          return preview.invoke(connectorId, actionName, args);
        },
      };
    }
    return runWithExecutionContext(ctx,()=>runWithConnectorBinding(binding, () => handler.fetch(request, env, ctx)));
  },
};

export default worker;
