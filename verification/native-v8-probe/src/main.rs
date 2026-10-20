use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::{fs, path::Path};

const CORE: &[u8] = include_bytes!("../../core-probe/assets/index-aa597334.jsc");
const METADATA: &str = include_str!("../../core-probe/assets/metadata.json");
const BASELINE: &str = include_str!("../../core-probe/assets/windows-baseline.json");

fn eval<'s>(
    scope: &v8::PinScope<'s, '_>,
    source: &str,
) -> Result<v8::Local<'s, v8::Value>, String> {
    let source = v8::String::new(scope, source).ok_or("Unable to allocate script string")?;
    let script =
        v8::Script::compile(scope, source, None).ok_or("Host script compilation failed")?;
    script
        .run(scope)
        .ok_or("Host script execution failed".into())
}

fn execute(mode: &str) -> Result<Value, String> {
    let original_hash = format!("{:x}", Sha256::digest(CORE));
    if original_hash != "aa5973342b26eae4d3f7bcdf81f428a72b20d562b1d54ad141d3df5393061aa1" {
        return Err("Original engine identity does not match the audited reference".into());
    }
    let platform = v8::new_default_platform(0, false).make_shared();
    v8::V8::initialize_platform(platform);
    v8::V8::set_flags_from_string("--no-lazy --no-flush-bytecode");
    v8::V8::initialize();
    let runtime_version = v8::V8::get_version();
    let isolate = &mut v8::Isolate::new(v8::CreateParams::default());
    v8::scope!(let handles, isolate);
    let context = v8::Context::new(handles, Default::default());
    let scope = &v8::ContextScope::new(handles, context);

    // Create a cache only to observe this host's header. The known original payload is never rewritten.
    let dummy = v8::String::new(scope, "(function(){return 0})").unwrap();
    let dummy_script =
        v8::Script::compile(scope, dummy, None).ok_or("Dummy script compilation failed")?;
    let own_cache = dummy_script
        .get_unbound_script(scope)
        .create_code_cache()
        .ok_or("Host cache creation failed")?;
    let source_header: Vec<u8> = CORE[..24].to_vec();
    let host_header: Vec<u8> = own_cache[..24].to_vec();
    let mut cache = CORE.to_vec();
    let mut normalized = Vec::new();
    // Experimental compatibility modes are isolated child processes in CI. A pass requires all original output comparisons.
    if mode == "flags" || mode == "host" || (mode == "magic" || mode == "snapshot") {
        cache[12..16].copy_from_slice(&own_cache[12..16]);
        normalized.push("flags@12..16");
    }
    if mode == "host" || (mode == "magic" || mode == "snapshot") {
        cache[4..8].copy_from_slice(&own_cache[4..8]);
        normalized.push("version@4..8");
    }
    if (mode == "magic" || mode == "snapshot") {
        if cache[2..4] != own_cache[2..4] {
            return Err("V8 cache magic family differs".into());
        }
        cache[..4].copy_from_slice(&own_cache[..4]);
        normalized.push("host-magic@0..4");
    }
    if mode == "snapshot" {
        cache[16..20].copy_from_slice(&own_cache[16..20]);
        normalized.push("experimental-snapshot-identity@16..20");
    }
    let length = u32::from_le_bytes(CORE[8..12].try_into().unwrap()) as usize;
    if !(2..=2_000_000).contains(&length) {
        return Err("Unexpected original source-length header".into());
    }
    let dummy_source = format!("\"{}\"", "\u{200b}".repeat(length - 2));
    let source = v8::String::new(scope, &dummy_source)
        .ok_or("Unable to allocate compatible dummy source")?;
    let cached = v8::script_compiler::CachedData::new(&cache);
    let mut source = v8::script_compiler::Source::new_with_cached_data(source, None, cached);
    let script = v8::script_compiler::compile(scope, &mut source, v8::script_compiler::CompileOptions::ConsumeCodeCache, v8::script_compiler::NoCacheReason::NoReason)
        .ok_or_else(|| format!("Original cache compilation failed: {runtime_version}, source header {source_header:?}, host header {host_header:?}"))?;
    if source.get_cached_data().is_some_and(|data| data.rejected()) {
        return Ok(
            json!({"passed":false,"mode":mode,"cacheRejected":true,"runtime":runtime_version,"sourceHeader":source_header,"hostHeader":host_header,"normalized":normalized,"payloadChanged":false}),
        );
    }
    let wrapper = script.run(scope).ok_or("Cached wrapper execution failed")?;
    let wrapper = v8::Local::<v8::Function>::try_from(wrapper)
        .map_err(|_| "Cache did not produce the CommonJS wrapper")?;
    eval(scope, "globalThis.console={log(){},warn(){},error(){},debug(){}};globalThis.ImageData=class ImageData{constructor(data,width,height){if(typeof data==='number'){this.width=data;this.height=width;this.data=new Uint8ClampedArray(data*width*4)}else{this.data=data;this.width=width;this.height=height}}};")?;
    let exports = v8::Object::new(scope);
    let module = v8::Object::new(scope);
    let exports_key = v8::String::new(scope, "exports").unwrap();
    module.set(scope, exports_key.into(), exports.into());
    let undefined = v8::undefined(scope);
    let filename = v8::String::new(scope, "core.jsc").unwrap();
    let directory = v8::String::new(scope, ".").unwrap();
    wrapper
        .call(
            scope,
            exports.into(),
            &[
                exports.into(),
                undefined.into(),
                module.into(),
                filename.into(),
                directory.into(),
            ],
        )
        .ok_or("Original module initialization failed in the standalone host")?;
    let loaded = module
        .get(scope, exports_key.into())
        .ok_or("Missing CommonJS exports")?;
    let core_key = v8::String::new(scope, "__core").unwrap();
    context.global(scope).set(scope, core_key.into(), loaded);
    eval(scope, &format!("globalThis.__definitions={METADATA};"))?;
    let definitions: Value = serde_json::from_str(METADATA).map_err(|e| e.to_string())?;
    let baseline: Value = serde_json::from_str(BASELINE).map_err(|e| e.to_string())?;
    let reference = baseline["dither"]
        .as_array()
        .ok_or("Missing reference outputs")?;
    let mut cases = Vec::new();
    for (index, definition) in definitions.as_array().unwrap().iter().enumerate() {
        let source = format!(
            r#"(()=>{{try{{const d=__definitions[{index}];const width=64,height=48;const pixels=new Uint8ClampedArray(width*height*4);for(let y=0;y<height;y++)for(let x=0;x<width;x++){{const i=(y*width+x)*4;pixels[i]=(x*7+y*11)%256;pixels[i+1]=(x*13+y*3)%256;pixels[i+2]=(x*5+y*17)%256;pixels[i+3]=255;}}const params={{palette:['#000000','#ffffff'],orderedCycling:false,scale:45,luminanceThreshold:50,controls:Object.fromEntries(d.controls.map(c=>[c.id,c.defaultValue]))}};const result=__core.getAlgorithmById(d.metadata.id).process({{imageData:new ImageData(pixels,width,height),outputCanvas:null,width,height}},params);if(result&&typeof result.then==='function')return JSON.stringify({{error:'Processor requires asynchronous handling'}});return JSON.stringify({{width:result.width,height:result.height,pixels:Array.from(result.data)}})}}catch(e){{return JSON.stringify({{error:String(e)}})}}}})()"#
        );
        let result = eval(scope, &source)?;
        let result = result
            .to_string(scope)
            .ok_or("Result is not serializable")?
            .to_rust_string_lossy(scope);
        let result: Value = serde_json::from_str(&result).map_err(|e| e.to_string())?;
        let id = definition["metadata"]["id"].as_str().unwrap();
        if let Some(error) = result.get("error") {
            cases.push(json!({"id":id,"passed":false,"error":error}));
            continue;
        }
        let bytes = result["pixels"]
            .as_array()
            .ok_or("Missing RGBA result")?
            .iter()
            .map(|value| value.as_u64().unwrap_or(256))
            .collect::<Vec<_>>();
        let valid = bytes.iter().all(|v| *v <= 255)
            && bytes.len()
                == (result["width"].as_u64().unwrap_or(0)
                    * result["height"].as_u64().unwrap_or(0)
                    * 4) as usize;
        let bytes = bytes.into_iter().map(|v| v as u8).collect::<Vec<_>>();
        let hash = format!("{:x}", Sha256::digest(&bytes));
        let expected = reference
            .iter()
            .find(|item| item["id"] == id)
            .ok_or("No matching baseline")?;
        let deterministic = definition["features"]["isDeterministic"]
            .as_bool()
            .unwrap_or(false);
        let equal = expected["pixelSha256"].as_str() == Some(hash.as_str());
        cases.push(json!({"id":id,"passed":valid && (!deterministic || equal),"deterministic":deterministic,"valid":valid,"pixelSha256":hash,"referenceSha256":expected["pixelSha256"],"equal":equal}));
    }
    Ok(
        json!({"passed":cases.iter().all(|x|x["passed"]==true),"mode":mode,"experimental":true,"runtime":runtime_version,"platform":std::env::consts::OS,"architecture":std::env::consts::ARCH,"originalSha256":original_hash,"payloadChanged":false,"normalized":normalized,"sourceHeader":source_header,"hostHeader":host_header,"cases":cases}),
    )
}

fn main() {
    let mode = std::env::args()
        .nth(1)
        .unwrap_or_else(|| "strict".to_owned());
    let report = match execute(&mode) {
        Ok(report) => report,
        Err(error) => json!({"passed":false,"mode":mode,"error":error}),
    };
    let directory = Path::new("artifacts/native-v8");
    fs::create_dir_all(directory).unwrap();
    fs::write(
        directory.join(format!(
            "{mode}-{}-{}.json",
            std::env::consts::OS,
            std::env::consts::ARCH
        )),
        serde_json::to_vec_pretty(&report).unwrap(),
    )
    .unwrap();
    println!("{}", serde_json::to_string_pretty(&report).unwrap());
    if report["passed"] != true {
        std::process::exit(1);
    }
}
