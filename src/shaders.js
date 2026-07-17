// 自定义 shader 集合：地球（昼夜/云影/海面高光）、大气辉光、太阳表面

export const earthShader = {
  vertex: /* glsl */ `
    varying vec2 vUv;
    varying vec3 vNormalW;
    varying vec3 vPosW;

    void main() {
      vUv = uv;
      vNormalW = normalize(mat3(modelMatrix) * normal);
      vPosW = (modelMatrix * vec4(position, 1.0)).xyz;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragment: /* glsl */ `
    uniform sampler2D dayMap;
    uniform sampler2D nightMap;
    uniform vec3 sunDirection;

    varying vec2 vUv;
    varying vec3 vNormalW;
    varying vec3 vPosW;

    void main() {
      vec3 normal = normalize(vNormalW);
      vec3 viewDir = normalize(cameraPosition - vPosW);
      float ndotl = dot(normal, sunDirection);

      vec3 dayColor = texture2D(dayMap, vUv).rgb;
      vec3 nightColor = texture2D(nightMap, vUv).rgb;

      // 昼夜过渡带（晨昏线附近平滑过渡，夜面泛出暖色城市灯光）
      float dayMix = smoothstep(-0.12, 0.25, ndotl);
      vec3 night = nightColor * vec3(1.0, 0.85, 0.6) * 1.6;
      // 晨昏线附近给夜景一点残光，避免生硬
      vec3 color = mix(night, dayColor * max(ndotl, 0.0) * 1.35 + dayColor * 0.03, dayMix);

      // 海面太阳高光：海洋在贴图中偏蓝，用蓝色主导度作为掩膜
      float oceanMask = smoothstep(0.05, 0.25, dayColor.b - dayColor.r);
      vec3 halfDir = normalize(sunDirection + viewDir);
      float spec = pow(max(dot(normal, halfDir), 0.0), 48.0);
      color += spec * oceanMask * vec3(1.0, 0.95, 0.85) * 0.55 * dayMix;

      // 大气边缘散射：视线掠过球缘时叠加蓝色，且只在受光侧
      float fresnel = pow(1.0 - max(dot(normal, viewDir), 0.0), 3.0);
      float litRim = smoothstep(-0.3, 0.4, ndotl);
      color += fresnel * vec3(0.35, 0.55, 1.0) * 0.55 * litRim;

      gl_FragColor = vec4(color, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }
  `,
};

// 大气辉光：略大于行星的背面球壳，边缘 Fresnel 发光
export const atmosphereShader = {
  vertex: /* glsl */ `
    varying vec3 vNormalW;
    varying vec3 vPosW;

    void main() {
      vNormalW = normalize(mat3(modelMatrix) * normal);
      vPosW = (modelMatrix * vec4(position, 1.0)).xyz;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragment: /* glsl */ `
    uniform vec3 glowColor;
    uniform float intensity;
    uniform vec3 sunDirection;

    varying vec3 vNormalW;
    varying vec3 vPosW;

    void main() {
      vec3 normal = normalize(vNormalW);
      vec3 viewDir = normalize(cameraPosition - vPosW);
      // BackSide 渲染，法线朝内，翻转后计算边缘强度
      float rim = pow(clamp(dot(-normal, viewDir), 0.0, 1.0), 3.5);
      // 受光侧更亮，背光侧几乎不可见
      float lit = smoothstep(-0.55, 0.35, dot(normal, sunDirection));
      float alpha = rim * intensity * mix(0.12, 1.0, lit);
      gl_FragColor = vec4(glowColor, alpha);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }
  `,
};

// 太阳表面：真实纹理 + 双层流动噪声扰动，模拟翻涌的等离子体
export const sunShader = {
  vertex: /* glsl */ `
    varying vec2 vUv;
    varying vec3 vNormalW;
    varying vec3 vPosW;

    void main() {
      vUv = uv;
      vNormalW = normalize(mat3(modelMatrix) * normal);
      vPosW = (modelMatrix * vec4(position, 1.0)).xyz;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragment: /* glsl */ `
    uniform sampler2D map;
    uniform float time;

    varying vec2 vUv;
    varying vec3 vNormalW;
    varying vec3 vPosW;

    // 经典 simplex 风格 hash 噪声（足够廉价）
    vec2 hash(vec2 p) {
      p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
      return -1.0 + 2.0 * fract(sin(p) * 43758.5453123);
    }
    float noise(vec2 p) {
      vec2 i = floor(p);
      vec2 f = fract(p);
      vec2 u = f * f * (3.0 - 2.0 * f);
      return mix(mix(dot(hash(i), f),
                     dot(hash(i + vec2(1.0, 0.0)), f - vec2(1.0, 0.0)), u.x),
                 mix(dot(hash(i + vec2(0.0, 1.0)), f - vec2(0.0, 1.0)),
                     dot(hash(i + vec2(1.0, 1.0)), f - vec2(1.0, 1.0)), u.x), u.y);
    }

    void main() {
      // 两层反向流动的噪声扰动 UV，让表面持续翻涌
      float n1 = noise(vUv * 18.0 + vec2(time * 0.03, time * 0.015));
      float n2 = noise(vUv * 36.0 - vec2(time * 0.02, time * 0.03));
      vec2 uv = vUv + vec2(n1, n2) * 0.006;

      vec3 tex = texture2D(map, uv).rgb;
      // 噪声调制亮度，形成明暗涌动的米粒组织
      float granulation = 0.85 + 0.3 * noise(vUv * 60.0 + vec2(time * 0.05));
      vec3 color = tex * granulation * 1.55;

      // 边缘偏暗且偏红（临边昏暗效应）
      vec3 viewDir = normalize(cameraPosition - vPosW);
      float limb = clamp(dot(normalize(vNormalW), viewDir), 0.0, 1.0);
      color *= mix(vec3(0.55, 0.28, 0.12), vec3(1.0), pow(limb, 0.55));

      gl_FragColor = vec4(color, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }
  `,
};
