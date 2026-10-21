// Unity URP (Gamma color space) shader ports for three.js r186.
//
// Each Unity shader used by the game is re-implemented as a THREE.ShaderMaterial. Sources:
// rider-worlds/Assets/Shader/*.shader + RW_*.hlsl (hand-decompiled Shader Graphs) and URP 12 built-in shaders.
//
// Conventions (see createUnityMaterial):
// - Every Unity material property is a uniform with the exact Unity name. Colors / vectors -> vec4,
//   floats -> float, textures -> sampler2D + "<name>_ST" vec4 (scale.xy, offset.zw).
// - Output is raw gamma-space color (Unity Gamma color space): no color management, no tonemapping.
// - three world = Unity world mirrored on Z. Shaders that read world / object Z negate it to get the Unity value.
//   Direction vectors (normal, view, light) are only used in dot products or transformed by the view
//   matrix, which is mirror-invariant (three view space == Unity view space).
// - Ambient = flat white trilight, so baked GI / SH == vec3(1.0). One directional main light via shared uniforms.

import * as THREE from 'three';

// ---------------------------------------------------------------------------------------------------------------
// Shader Graph property tables, generated from the Properties blocks of the .shader files:
// [name, 'f' float | 'v' color/vector (vec4) | 't' texture, default]

const SG = {
	"Shader Graphs_Background": { queue: 2000, props: [
		["Texture2D_cded4512818846cbaecf8c4964ca8a72", "t", "white"],
		["Vector1_6a03dbb1b42040d58458f1c68fe848c7", "f", 0.5],
		["Color_e8ca45589c5041d4a9e083ab137612a4_2", "v", [0.0283019, 0, 0.169811, 0]],
		["Color_e8ca45589c5041d4a9e083ab137612a4", "v", [0.0660377, 0, 0.396226, 0]],
		["Color_e8ca45589c5041d4a9e083ab137612a4_1", "v", [0, 0.299667, 0.764151, 0]],
		["Vector1_beaf53ac25dd4549911d7da657df018a", "f", 0],
		["Vector1_8fcc19aba6ba459899b062a5a1621b47", "f", 1],
		["Vector1_1", "f", 1],
		["Vector1_d06007c0be3f400c8dae942e0568cf83", "f", 0],
		["Vector1_423782c037ad4cbea6520795a48acef0", "f", 0.2],
		["Color_1", "v", [0.264151, 0.264151, 0.264151, 0]],
		["Color_19324113c65049ee91a4531b835d17fb", "v", [0, 0, 0, 0]],
	] },
	"Shader Graphs_BackgroundBase": { queue: 2000, props: [
		["Texture2D_cded4512818846cbaecf8c4964ca8a72", "t", "white"],
		["Vector1_6a03dbb1b42040d58458f1c68fe848c7", "f", 0.5],
		["Color_e8ca45589c5041d4a9e083ab137612a4_2", "v", [0.0283019, 0, 0.169811, 0]],
		["Color_e8ca45589c5041d4a9e083ab137612a4", "v", [0.0660377, 0, 0.396226, 0]],
		["Color_e8ca45589c5041d4a9e083ab137612a4_1", "v", [0, 0.299667, 0.764151, 0]],
		["Vector1_beaf53ac25dd4549911d7da657df018a", "f", 0],
		["Vector1_8fcc19aba6ba459899b062a5a1621b47", "f", 1],
		["Vector1_1", "f", 1],
	] },
	"Shader Graphs_Background_2": { queue: 2000, props: [
		["Texture2D_cded4512818846cbaecf8c4964ca8a72", "t", "white"],
		["Vector1_6a03dbb1b42040d58458f1c68fe848c7", "f", 0.5],
		["Color_e8ca45589c5041d4a9e083ab137612a4_2", "v", [0.0283019, 0, 0.169811, 0]],
		["Color_e8ca45589c5041d4a9e083ab137612a4_3", "v", [0, 0.299667, 0.764151, 0]],
		["Color_e8ca45589c5041d4a9e083ab137612a4", "v", [0.0660377, 0, 0.396226, 0]],
		["Color_e8ca45589c5041d4a9e083ab137612a4_1", "v", [0, 0.299667, 0.764151, 0]],
		["Vector1_beaf53ac25dd4549911d7da657df018a", "f", 0],
		["Vector1_cb69590c128e411f92274645b58ed524", "f", 0],
		["Vector1_8fcc19aba6ba459899b062a5a1621b47", "f", 1],
		["Vector1_1", "f", 1],
		["Vector1_d06007c0be3f400c8dae942e0568cf83", "f", 0],
		["Vector1_423782c037ad4cbea6520795a48acef0", "f", 0.2],
		["Vector1_d06007c0be3f400c8dae942e0568cf83_1", "f", 0],
		["Color_1", "v", [0.264151, 0.264151, 0.264151, 0]],
		["Color_19324113c65049ee91a4531b835d17fb", "v", [0.59434, 0, 0, 0]],
	] },
	"Shader Graphs_Background_2_Glass": { queue: 2000, props: [
		["Texture2D_cded4512818846cbaecf8c4964ca8a72", "t", "white"],
		["Vector1_6a03dbb1b42040d58458f1c68fe848c7", "f", 0.5],
		["Color_e8ca45589c5041d4a9e083ab137612a4_2", "v", [0.0283019, 0, 0.169811, 0]],
		["Color_e8ca45589c5041d4a9e083ab137612a4_3", "v", [0, 0.299667, 0.764151, 0]],
		["Color_e8ca45589c5041d4a9e083ab137612a4", "v", [0.0660377, 0, 0.396226, 0]],
		["Color_e8ca45589c5041d4a9e083ab137612a4_1", "v", [0, 0.299667, 0.764151, 0]],
		["Vector1_beaf53ac25dd4549911d7da657df018a", "f", 0],
		["Vector1_cb69590c128e411f92274645b58ed524", "f", 0],
		["Vector1_8fcc19aba6ba459899b062a5a1621b47", "f", 1],
		["Vector1_1", "f", 1],
		["Vector1_d06007c0be3f400c8dae942e0568cf83", "f", 0],
		["Vector1_423782c037ad4cbea6520795a48acef0", "f", 0.2],
		["Vector1_d06007c0be3f400c8dae942e0568cf83_1", "f", 0],
		["Color_1", "v", [0.264151, 0.264151, 0.264151, 0]],
		["Color_19324113c65049ee91a4531b835d17fb", "v", [0.59434, 0, 0, 0]],
		["Texture2D_a9bbafba50f54cef9f954e29fa940bb4", "t", "white"],
		["Vector2_ba89400d91dd431ea839a7eeb0437a94", "v", [1, 1, 0, 0]],
		["Vector2_ba89400d91dd431ea839a7eeb0437a94_1", "v", [0, 0, 0, 0]],
		["Color_fd5916f3773e47e386fe18b4b9783671", "v", [0, 0, 0, 0]],
	] },
	"Shader Graphs_Background_MetallicMatcap": { queue: 2000, props: [
		["Texture2D_cded4512818846cbaecf8c4964ca8a72", "t", "white"],
		["Texture2D_cded4512818846cbaecf8c4964ca8a72_1", "t", "white"],
		["Texture2D_cded4512818846cbaecf8c4964ca8a72_2", "t", "white"],
		["Color_e8ca45589c5041d4a9e083ab137612a4_2", "v", [0.0283019, 0, 0.169811, 0]],
		["Color_e8ca45589c5041d4a9e083ab137612a4", "v", [0.0660377, 0, 0.396226, 0]],
		["Color_e8ca45589c5041d4a9e083ab137612a4_1", "v", [0, 0.299667, 0.764151, 0]],
		["Vector1_beaf53ac25dd4549911d7da657df018a", "f", 0],
		["Vector1_8fcc19aba6ba459899b062a5a1621b47", "f", 1],
		["Vector1_27dcd979a2cd483b9e450994d5bb8145", "f", 1],
	] },
	"Shader Graphs_Background_MetallicScreen": { queue: 2000, props: [
		["Texture2D_cded4512818846cbaecf8c4964ca8a72", "t", "white"],
		["Texture2D_cded4512818846cbaecf8c4964ca8a72_1", "t", "white"],
		["Texture2D_cded4512818846cbaecf8c4964ca8a72_2", "t", "white"],
		["Color_e8ca45589c5041d4a9e083ab137612a4_2", "v", [0.0283019, 0, 0.169811, 0]],
		["Color_e8ca45589c5041d4a9e083ab137612a4", "v", [0.0660377, 0, 0.396226, 0]],
		["Color_e8ca45589c5041d4a9e083ab137612a4_1", "v", [0, 0.299667, 0.764151, 0]],
		["Vector1_beaf53ac25dd4549911d7da657df018a", "f", 0],
		["Vector1_8fcc19aba6ba459899b062a5a1621b47", "f", 1],
		["Vector1_27dcd979a2cd483b9e450994d5bb8145", "f", 1],
	] },
	"Shader Graphs_Background_ScrollingOverlay": { queue: 2000, props: [
		["Texture2D_cded4512818846cbaecf8c4964ca8a72", "t", "white"],
		["Vector1_6a03dbb1b42040d58458f1c68fe848c7", "f", 0.5],
		["Color_e8ca45589c5041d4a9e083ab137612a4_2", "v", [0.0283019, 0, 0.169811, 0]],
		["Color_e8ca45589c5041d4a9e083ab137612a4", "v", [0.0660377, 0, 0.396226, 0]],
		["Color_e8ca45589c5041d4a9e083ab137612a4_1", "v", [0, 0.299667, 0.764151, 0]],
		["Vector1_beaf53ac25dd4549911d7da657df018a", "f", 0],
		["Vector1_8fcc19aba6ba459899b062a5a1621b47", "f", 1],
		["Vector1_1", "f", 1],
		["Vector1_d06007c0be3f400c8dae942e0568cf83", "f", 0],
		["Vector1_423782c037ad4cbea6520795a48acef0", "f", 0.2],
		["Color_1", "v", [0.264151, 0.264151, 0.264151, 0]],
		["Color_19324113c65049ee91a4531b835d17fb", "v", [0, 0, 0, 0]],
		["Texture2D_9033b35b109648d18b15d550d4faf493", "t", "white"],
		["Color_f3d93fcef13b4062809b532179c1acc8", "v", [0, 0.723132, 1, 0]],
		["Vector2_cc8e82042aee4a15a6c5622362403828", "v", [1, 1, 0, 0]],
		["Vector2_7cbb5ada2fb04729863452a1b4639891", "v", [1, 1, 0, 0]],
		["Texture2D_97bb4cce4a6448c9a452aba25d079f24", "t", "white"],
		["Vector2_1", "v", [1, 1, 0, 0]],
		["Color_c49685c7562f4a75b9a43f6a419cf4fc", "v", [1, 0, 0, 0]],
	] },
	"Shader Graphs_Bikes": { queue: 2000, props: [
		["_DiffuseMap", "t", "white"],
		["_EmissionMap", "t", "white"],
		["_Mask", "t", "white"],
		["_ColorPrimary", "v", [0.878431, 0, 0.681354, 0]],
		["_ColorPrimaryDark", "v", [0.518868, 0, 0.403049, 0]],
		["_ColorSecondary", "v", [0.603922, 0, 0.473072, 0]],
		["_ColorSecondaryDark", "v", [0.369, 0, 0.291316, 0]],
		["_EmissionAmount", "f", 0.3],
	] },
	"Shader Graphs_Bikes_Special": { queue: 2000, props: [
		["_DiffuseMap", "t", "white"],
		["_EmissionMap", "t", "white"],
		["_Mask", "t", "white"],
		["_ColorPrimary", "v", [0.878431, 0, 0.681354, 0]],
		["_ColorPrimaryDark", "v", [0.518868, 0, 0.403049, 0]],
		["_ColorSecondary", "v", [0.365444, 0, 0.603922, 0]],
		["_ColorSecondaryDark", "v", [0.165882, 0, 0.368627, 0]],
		["Texture2D_b072c57e58fd4132b55de0767e45d02e", "t", "white"],
		["Color_45575abbd9da41d391c9f3f451c36480", "v", [1, 0, 0, 0]],
		["Vector1_a95df7caa9f54e538b6f2e0d86f9dbda", "f", 2],
		["Texture2D_99b59bf9ca1448a7a4a7d86a4f895d76", "t", "white"],
		["_Overlay_Color", "v", [0, 0, 0, 0]],
		["Vector2_1739477025ac401ebfba97a5f23593e8", "v", [1, 1, 0, 0]],
		["Vector4_ab283b7ee70a45b9a1245c16606d4bdc", "v", [0, 0, 0, 0]],
		["Texture2D_1", "t", "white"],
		["_Overlay_Mask_Tiling", "v", [1, 1, 0, 0]],
		["Vector4_ab283b7ee70a45b9a1245c16606d4bdc_1", "v", [0, 0, 0, 0]],
		["_Texure_Overlay_Mask_UV", "t", "white"],
		["_Texture_MatCap", "t", "white"],
		["_Texture_MatCap_Mask", "t", "white"],
		["_Matcap_Additive", "f", 0],
	] },
	"Shader Graphs_BonusRide_Portal": { queue: 2450, props: [
		["Texture2D_2741f467f1544891a45008e02bbceb2e", "t", "white"],
		["Texture2D_284e2105e94742d286240fc15fefd128", "t", "white"],
		["Color_9a5d270665b84209bc6b861f78f38765", "v", [0, 0.275141, 0.773585, 0]],
		["Vector1_b6587cd9c3c24e0ba4212386a97efa27", "f", 0],
		["Vector2_133d8e07a40f4c488f43b63387874702", "v", [0.2, 0, 0, 0]],
		["Vector2_f849d0646ee44183a6a7baabe66e55d5", "v", [1, 1, 0, 0]],
	] },
	"Shader Graphs_Bunker_Lightbeam": { queue: 3000, props: [
		["Texture2D_9033b35b109648d18b15d550d4faf493", "t", "white"],
		["Vector2_cc8e82042aee4a15a6c5622362403828", "v", [1, 1, 0, 0]],
		["Vector2_cc8e82042aee4a15a6c5622362403828_2", "v", [1, 1, 0, 0]],
		["Vector2_7cbb5ada2fb04729863452a1b4639891", "v", [1, 1, 0, 0]],
		["Vector2_1", "v", [1, 1, 0, 0]],
		["ColorOverlay", "v", [0, 0.723132, 1, 0]],
	] },
	"Shader Graphs_Bunker_Lightbeam_Door": { queue: 3000, props: [
		["Texture2D_9033b35b109648d18b15d550d4faf493", "t", "white"],
		["Vector2_cc8e82042aee4a15a6c5622362403828", "v", [1, 1, 0, 0]],
		["Vector2_cc8e82042aee4a15a6c5622362403828_2", "v", [1, 1, 0, 0]],
		["Vector2_7cbb5ada2fb04729863452a1b4639891", "v", [1, 1, 0, 0]],
		["Vector2_1", "v", [1, 1, 0, 0]],
		["_Color", "v", [0, 0.723132, 1, 0]],
	] },
	"Shader Graphs_Cannon": { queue: 2000, props: [
		["_GlowStrength", "f", 2],
		["_CannonTexture", "t", "white"],
		["_GlowColor", "v", [1, 1, 1, 0]],
	] },
	"Shader Graphs_ChromaticOffsetAdditive": { queue: 3000, props: [
		["_Color", "v", [4, 4, 4, 1]],
		["Texture2D_161cc36a2247464a82d988c5fe7f7650", "t", "white"],
		["Vector2_a62120b08bb74720860b21e30b58b908", "v", [1, 1, 0, 0]],
		["_Chromatic_Offset", "v", [0, 0, 0, 0]],
		["_Chromatic_Offset_Rotation", "f", 0],
	] },
	"Shader Graphs_Death_Helix": { queue: 3000, props: [
		["_Texture", "t", "white"],
		["_Tiling_RG", "v", [1, 1, 0, 0]],
		["_Tiling_B", "v", [1, 1, 0, 0]],
		["_Color_Main", "v", [1, 0.7681527, 0, 0]],
		["_Color_Secondary", "v", [1, 0, 0, 0]],
	] },
	"Shader Graphs_GravityField": { queue: 3000, props: [
		["_Texture_Main", "t", "white"],
		["_Color_Main", "v", [1, 1, 1, 0.305882]],
		["_Background_color", "v", [0, 0, 0, 0.184314]],
		["_Texture_Mask", "t", "white"],
		["_Tiling_Main", "v", [1, 1, 0, 0]],
		["_Movement_Speed", "v", [0, 0.35, 0, 0]],
		["_Rotate", "f", 0],
		["_Color_Main_Off", "v", [0, 0, 0, 0]],
		["_Color_Background_Off", "v", [0, 0, 0, 0]],
		["_Activate_off_state", "f", 0],
		["_Time_Anim", "f", 0],
		["_Sparks_Tex", "t", "white"],
		["_Sparks_Color", "v", [0, 0.0295568, 0.0953075, 0]],
		["_Tiling_sparks", "v", [1, 1, 0, 0]],
		["_Speed_Sparks", "v", [1.5, 1.5, 0, 0]],
		["_Gradient_Mask", "t", "white"],
		["_Gradient_Color", "v", [0, 0.564706, 1, 1]],
		["_Gradient_Anim", "f", 0],
	] },
	"Shader Graphs_HardCurrency": { queue: 2000, props: [
		["Texture2D_cded4512818846cbaecf8c4964ca8a72_1", "t", "white"],
		["Texture2D_df6d74a2005c4719a8e64d9d9600fe95", "t", "white"],
		["Texture2D_0e18113ac62346fd8432b75c99e69bfa", "t", "white"],
		["Vector2_40d12c7403e14baa9abbb1ede167645b", "v", [0, -0.3, 0, 0]],
		["Color_acd33005c202438db81141a8465728db", "v", [1, 0.916574, 0.806604, 0]],
		["Color_3ed065c46d094deaac4d50b32efc18a0", "v", [1, 0, 0, 0]],
		["Color_aa7cfa3569014970a6a6a97ad381ea98", "v", [4, 4, 4, 1]],
	] },
	"Shader Graphs_Lootbox": { queue: 2000, props: [
		["_DiffuseMap", "t", "white"],
		["_Mask", "t", "white"],
		["Color_c877a6332d514559a5a807dfa530a493", "v", [1, 0, 0, 0]],
		["_ColorOn", "v", [0.878431, 0, 0.681354, 0]],
		["_ColorEmission_1", "v", [0, 0, 0, 0]],
		["_ColorEmissionOn", "v", [0.878431, 0, 0.681354, 0]],
		["Vector1_cd11462755484a7c92cc144df0293726", "f", 1],
	] },
	"Shader Graphs_Lootbox_Light": { queue: 3000, props: [
		["Texture2D_2741f467f1544891a45008e02bbceb2e", "t", "white"],
		["_Color", "v", [2, 2, 2, 1]],
		["Vector1_fc1e85b819d442d8916e1a84994a556c", "f", 0.5],
	] },
	"Shader Graphs_MatCap": { queue: 3000, props: [
		["Texture2D_cded4512818846cbaecf8c4964ca8a72_1", "t", "white"],
		["Texture2D_cded4512818846cbaecf8c4964ca8a72_2", "t", "white"],
		["Color_acd33005c202438db81141a8465728db", "v", [0.735849, 0.399163, 0.399163, 0]],
	] },
	"Shader Graphs_Particle_ChromaticOffsetAdditive": { queue: 3000, props: [
		["_Color", "v", [4, 4, 4, 1]],
		["Texture2D_161cc36a2247464a82d988c5fe7f7650", "t", "white"],
		["_Mask", "t", "white"],
		["Vector2_a62120b08bb74720860b21e30b58b908", "v", [1, 1, 0, 0]],
		["_ScrollSpeed", "v", [0.1, 0, 0, 0]],
	] },
	"Shader Graphs_Particle_Dissolve_Hard_Additive": { queue: 3000, props: [
		["_Texture", "t", "white"],
		["_DissolveMask", "t", "white"],
		["_Color", "v", [1, 1, 1, 1]],
	] },
	"Shader Graphs_Particle_Dissolve_Hard_Emission": { queue: 2450, props: [
		["_Texture", "t", "white"],
		["_DissolveMask", "t", "white"],
		["_Color", "v", [1, 1, 1, 0]],
	] },
	"Shader Graphs_Particle_Dissolve_Hard_InOut_Additive": { queue: 3000, props: [
		["_Texture", "t", "white"],
		["_DissolveMask", "t", "white"],
		["_Color", "v", [1, 1, 1, 0]],
	] },
	"Shader Graphs_Particle_Dissolve_Hard_InOut_Emission": { queue: 2450, props: [
		["_Texture", "t", "white"],
		["_DissolveMask", "t", "white"],
		["_Color", "v", [1, 1, 1, 0]],
	] },
	"Shader Graphs_Particle_Dissolve_Scrolling_Soft_Additive": { queue: 3000, props: [
		["_Texture", "t", "white"],
		["_DissolveMask", "t", "white"],
		["_Color", "v", [1, 1, 1, 1]],
		["_DissolveMask_Tiling", "v", [1, 1, 0, 0]],
	] },
	"Shader Graphs_Particle_Dissolve_Soft_AB_Fog": { queue: 3000, props: [
		["_DissolveMask", "t", "white"],
		["_Texture", "t", "white"],
		["_Color", "v", [1, 1, 1, 1]],
		["Vector1_be654cb9721b41de8eb3a47e320de7f4", "f", 0],
		["Vector1_be654cb9721b41de8eb3a47e320de7f4_1", "f", 0],
		["Color_d2fcc885299542a089ca4f39fe45a651", "v", [0.6132076, 0.1417319, 0.1417319, 0]],
	] },
	"Shader Graphs_Particle_Dissolve_Soft_Additive": { queue: 3000, props: [
		["_Texture", "t", "white"],
		["_DissolveMask", "t", "white"],
		["_Color", "v", [1, 1, 1, 1]],
	] },
	"Shader Graphs_Particle_Dissolve_Soft_Emission": { queue: 3000, props: [
		["_Texture", "t", "white"],
		["_DissolveMask", "t", "white"],
		["_Color", "v", [1, 1, 1, 1]],
	] },
	"Shader Graphs_Particle_Distortion": { queue: 3000, props: [
		["Texture2D_0ac0bf9879d047d0b057aaa087428274", "t", "white"],
	] },
	"Shader Graphs_Particle_Distortion_WorldspaceMasked": { queue: 3000, props: [
		["Texture2D_0ac0bf9879d047d0b057aaa087428274", "t", "white"],
		["_Normal_Tiling", "v", [1, 1, 0, 0]],
		["_Normal_Scrollspeed", "v", [0, 0, 0, 0]],
		["_Texture_Mask", "t", "white"],
	] },
	"Shader Graphs_Particle_Emission": { queue: 3000, props: [
		["Texture2D_2741f467f1544891a45008e02bbceb2e", "t", "white"],
		["Color_285372d95ddf4eeb85c3d02afe2ab943", "v", [2, 2, 2, 1]],
	] },
	"Shader Graphs_Particle_Scrolling_Masked": { queue: 3000, props: [
		["Color_c05728de45304bd38c31a09d4b91c6f3_1", "v", [1, 0, 0.0471201, 1]],
		["Color_4a591be828144a7f9318522928b6c44f", "v", [1, 0, 0, 1]],
		["Texture2D_161cc36a2247464a82d988c5fe7f7650", "t", "white"],
		["Vector2_a62120b08bb74720860b21e30b58b908", "v", [1, 1, 0, 0]],
		["Vector2_cf3b16e33cfb44d09a5a545ddf076c6f", "v", [1, 0, 0, 0]],
		["Texture2D_1", "t", "white"],
		["Vector2_a62120b08bb74720860b21e30b58b908_1", "v", [1, 1, 0, 0]],
		["Vector2_cf3b16e33cfb44d09a5a545ddf076c6f_1", "v", [0.5, 0, 0, 0]],
	] },
	"Shader Graphs_Particle_ZTest_Additive": { queue: 3000, props: [
		["Texture2D_2741f467f1544891a45008e02bbceb2e", "t", "white"],
		["Color_285372d95ddf4eeb85c3d02afe2ab943", "v", [2, 2, 2, 1]],
	] },
	"Shader Graphs_Reactor_Beam": { queue: 3000, props: [
		["Color_e8ca45589c5041d4a9e083ab137612a4_1", "v", [0, 0.393132, 1, 0]],
		["Texture2D_cded4512818846cbaecf8c4964ca8a72", "t", "white"],
		["Vector1_703bad392195426ab400619356be8972", "f", 1],
		["Boolean_1b1afcb0ec244bc699bc522ed89b771f", "f", 0],
		["Vector1_4f72f6f11bf3404986e7aa5b29243688", "f", 3],
		["Vector2_3042803bb77f4ac5b161f1eda36d78dd", "v", [1, 0.6, 0, 0]],
		["Vector2_0131f92bca074749b70052292cf9fc04", "v", [0, 0, 0, 0]],
	] },
	"Shader Graphs_Reactor_WorldEffect": { queue: 3000, props: [
		["Texture2D_8c981c34314c421791f22dc9d783d309", "t", "white"],
		["Vector2_1", "v", [1, 1, 0, 0]],
		["Vector2_24d513b04e814f47853a18c965f46cc0", "v", [0.1, 0.1, 0, 0]],
		["Color_1b76d33f9e074994918aa2755dd19782", "v", [1, 0.514151, 0.514151, 0]],
		["Color_bfe11d60aac447caba3e82728c37d851", "v", [0.424528, 0, 0.253819, 0]],
		["Texture2D_0717d1666a2c49bebbd11fe7b74323bc", "t", "white"],
		["Vector2_2622aceb100e4c30a15943658bae6c8b", "v", [1, 1, 0, 0]],
	] },
	"Shader Graphs_Roads": { queue: 2000, props: [
		["Texture2D_a7f42867e2214dd4878c924659a73941", "t", "white"],
		["_PrimaryColor", "v", [0, 0.517647, 0.262745, 1]],
		["_PrimaryEmission", "v", [0, 0.435294, 0.0980392, 1]],
		["_SecondaryColor", "v", [0, 0.705882, 0.145098, 1]],
		["_SecondaryEmission", "v", [0.645643, 2.79339, 0.855619, 1]],
	] },
	"Shader Graphs_Roads_Glass": { queue: 3000, props: [
		["Color_ddeec25da6f249a1b6e02cb565f13a9f", "v", [0, 0.495376, 0.688679, 1]],
		["Texture2D_b1f9528e5fe4437c885efc1b24e40d59", "t", "white"],
		["Texture2D_e11bbcd700174b3aa2627eb3f92444b9", "t", "white"],
		["Vector1_8cb173a3150d4feab59f840b5471b4ae", "f", 0.5],
		["Vector2_1249dee7d46c41e8a4ae430cf84319ed", "v", [1, 1, 0, 0]],
		["Color_e35eeb5d244e4f4fa1a434eb4a69befb", "v", [0, 0.273986, 0.660377, 1]],
		["Vector1_68d76f3157424fb883bc3c3c08ebc977", "f", 1],
		["Texture2D_3ec162dadf9c4969a711b436d999a0c5", "t", "white"],
		["Vector2_2", "v", [0.1, 0.1, 0, 0]],
		["Vector2_3", "v", [0.1, 0.1, 0, 0]],
		["Color_b2c8d87c0e9449d6b9fe250f8731a329", "v", [1, 1, 1, 0]],
	] },
	"Shader Graphs_Roads_Magnetic": { queue: 2000, props: [
		["Texture2D_a7f42867e2214dd4878c924659a73941", "t", "white"],
		["_PrimaryColor", "v", [0, 0.517647, 0.262745, 1]],
		["_PrimaryEmission", "v", [0, 0.435294, 0.0980392, 1]],
		["_SecondaryColor", "v", [0, 0.705882, 0.145098, 1]],
		["_SecondaryEmission", "v", [0.645643, 2.79339, 0.855619, 1]],
		["OverlayTexture", "t", "white"],
		["Vector2_bc65fdad44894da9b709d0fdede5c536", "v", [1, 1, 0, 0]],
		["OverlayColor", "v", [0.100303, 0.433962, 0.170547, 1]],
		["OverlayColorEmission", "v", [0, 1, 0.210526, 1]],
	] },
	"Shader Graphs_ScrollingOverlay": { queue: 3000, props: [
		["Texture2D_9033b35b109648d18b15d550d4faf493", "t", "white"],
		["Texture2D_97bb4cce4a6448c9a452aba25d079f24", "t", "white"],
		["Vector2_cc8e82042aee4a15a6c5622362403828", "v", [1, 1, 0, 0]],
		["ColorOverlay", "v", [0, 0.723132, 1, 0]],
		["Vector2_7cbb5ada2fb04729863452a1b4639891", "v", [1, 1, 0, 0]],
		["Vector2_1", "v", [1, 1, 0, 0]],
	] },
	"Shader Graphs_Scrolling_Pixel_Hologram": { queue: 3000, props: [
		["_Texture", "t", "white"],
		["_Tiling", "v", [1, 1, 0, 0]],
		["_Color", "v", [2, 2, 2, 0]],
		["_PixelDensity", "f", 5],
		["_Scrollspeed", "v", [0, 0, 0, 0]],
		["_Texture_Mask", "t", "white"],
		["_TIling_Mask", "v", [1, 1, 0, 0]],
		["_Scrollspeed_Mask", "v", [0, 0, 0, 0]],
	] },
	"Shader Graphs_Trail_CosmicRift_Cracks_Transparent": { queue: 3000, props: [
		["_Texture", "t", "white"],
		["_Tiling", "v", [1, 1, 0, 0]],
		["_Color", "v", [1, 1, 1, 0]],
		["_Texture_Mask", "t", "white"],
		["_Mask_Offset", "v", [0, 0, 0, 0]],
		["_InnerMask", "f", 0],
		["_InnerMask_Smoothness", "f", 0.37],
	] },
	"Shader Graphs_Trail_CosmicRift_Transparent": { queue: 3000, props: [
		["_Color_Main", "v", [0, 0, 0, 0]],
		["_Texture_Noise", "t", "white"],
		["_Noise_Tiling", "v", [1, 1, 0, 0]],
		["_Texture_Mask", "t", "white"],
		["_Edge_Color", "v", [0, 0.4831705, 1, 0]],
		["_Edge", "f", 0.2],
		["_Edge_Shadow", "f", 0.2],
		["_SmoothStep", "f", 0],
	] },
	"Shader Graphs_Trail_DistortionWorldSpace": { queue: 3000, props: [
		["Texture2D_0ac0bf9879d047d0b057aaa087428274", "t", "white"],
		["_Tiling", "v", [1, 1, 0, 0]],
		["_Mask_Texture", "t", "white"],
		["_Distort_Amount", "f", 0.01],
		["_Distort_Speed", "v", [0.2, 0, 0, 0]],
	] },
	"Shader Graphs_Trail_Helix": { queue: 3000, props: [
		["_Texture", "t", "white"],
		["_Tiling", "v", [1, 1, 0, 0]],
		["_Scrolling_Speed", "v", [1, 0, 0, 0]],
		["_Scrolling_Speed_2", "v", [0.5, 0, 0, 0]],
		["_Color_Main", "v", [1, 0.7681527, 0, 0]],
		["_Color_Secondary", "v", [1, 0, 0, 0]],
	] },
	"Shader Graphs_Trail_Light": { queue: 3000, props: [
		["_Color", "v", [1, 1, 1, 1]],
		["Texture2D_161cc36a2247464a82d988c5fe7f7650", "t", "white"],
		["_Texture_Color_Overlay", "t", "white"],
		["Vector2_a62120b08bb74720860b21e30b58b908", "v", [1, 1, 0, 0]],
		["_ScrollSpeed_Color_Overlay", "v", [1, 0, 0, 0]],
		["_ScrollSpeed_R", "v", [1, 0, 0, 0]],
		["_ScrollSpeed_G", "v", [0.5, 0, 0, 0]],
		["_ScrollSpeed_B", "v", [0.3, 0, 0, 0]],
		["_Edge_Mask_Size", "f", 0.7],
		["_Base_Gradient_Size", "f", 0.7],
		["_Saturation_Amount", "f", 0.3],
	] },
	"Shader Graphs_Trail_Scrolling": { queue: 3000, props: [
		["_Texture", "t", "white"],
		["_Tiling", "v", [1, 1, 0, 0]],
		["_Scrolling_Speed", "v", [1, 0, 0, 0]],
		["_Color", "v", [1, 1, 1, 0]],
	] },
	"Shader Graphs_Trail_Scrolling_RGB": { queue: 3000, props: [
		["Color_c05728de45304bd38c31a09d4b91c6f3", "v", [8, 0, 0, 0]],
		["Color_c05728de45304bd38c31a09d4b91c6f3_2", "v", [7.999999, 1.901262, 0, 0]],
		["Color_c05728de45304bd38c31a09d4b91c6f3_1", "v", [7.999999, 0, 0.3393097, 0]],
		["Texture2D_161cc36a2247464a82d988c5fe7f7650", "t", "white"],
		["Vector2_a62120b08bb74720860b21e30b58b908", "v", [1, 1, 0, 0]],
		["Vector2_cf3b16e33cfb44d09a5a545ddf076c6f", "v", [1, 0, 0, 0]],
		["Vector2_cf3b16e33cfb44d09a5a545ddf076c6f_1", "v", [0.5, 0, 0, 0]],
		["Vector2_cf3b16e33cfb44d09a5a545ddf076c6f_2", "v", [0.3, 0, 0, 0]],
	] },
	"Shader Graphs_Trail_Scrolling_UVdistortion": { queue: 3000, props: [
		["_Texture", "t", "white"],
		["_Tiling", "v", [1, 1, 0, 0]],
		["_Scrolling_Speed", "v", [1, 0, 0, 0]],
		["_Color", "v", [1, 1, 1, 0]],
		["_Distortion", "t", "white"],
		["_Distortion_Tiling", "v", [0.2, 0.5, 0, 0]],
		["_Distortion_Amount", "f", 10],
	] },
	"Shader Graphs_WarpDrive_WorldEffect": { queue: 3000, props: [
		["Texture2D_8c981c34314c421791f22dc9d783d309", "t", "white"],
		["Color_1b76d33f9e074994918aa2755dd19782", "v", [1, 0.514151, 0.514151, 0]],
		["Color_bfe11d60aac447caba3e82728c37d851", "v", [0.424528, 0, 0.253819, 0]],
		["Vector2_1", "v", [1, 1, 0, 0]],
		["Vector2_24d513b04e814f47853a18c965f46cc0", "v", [1, 1, 0, 0]],
		["Texture2D_22d3557725e94d4db5de9637ed856579", "t", "white"],
		["Texture2D_86531ce8183e4eddb17b61ce81bbd85b", "t", "white"],
		["Vector2_673de8c33b704c48bf62b1c21befaade", "v", [0, 0, 0, 0]],
		["Vector2_d31589ae61234f099782fea6d4ebe06f", "v", [0, 0, 0, 0]],
	] },
	"Shader Graphs_WorldSpaceMask_Dissolve": { queue: 3000, props: [
		["Texture2D_81515f3383b74fffacc9fbf2fc4d8947", "t", "white"],
		["Color_2bfba747758f42d4813adb14e8baea1d", "v", [8, 8, 8, 1]],
		["Texture2D_43ea15fbb3ea4bb4b95a30a92dc732a9", "t", "white"],
		["Vector2_05984ac97ef445a0b8080b4989ef38e3", "v", [1, 1, 0, 0]],
		["Vector2_4bd351478aec4703bb98cece8e0d5129", "v", [0, 0, 0, 0]],
	] },
};

// ---------------------------------------------------------------------------------------------------------------
// Shared uniforms (fallbacks when ctx.shared does not provide them)

export const sharedUniforms = {
	uMainLightDir: { value: new THREE.Vector3(0, 1, 0) },
	uMainLightColor: { value: new THREE.Vector3(0, 0, 0) },
	uTime: { value: new THREE.Vector4(0, 0, 0, 0) },
	uSinTime: { value: new THREE.Vector4(0, 0, 0, 0) },
	// Indirect specular (reflection probe). The scenes use a custom reflection source with no cubemap -> black.
	uEnvReflection: { value: new THREE.Vector3(0, 0, 0) },
};

// Convenience: fills uTime / uSinTime exactly like Unity's _Time / _SinTime for time t (seconds).
export function updateSharedTime(t, shared = sharedUniforms) {
	if (shared.uTime) shared.uTime.value.set(t / 20, t, t * 2, t * 3);
	if (shared.uSinTime) shared.uSinTime.value.set(Math.sin(t / 8), Math.sin(t / 4), Math.sin(t / 2), Math.sin(t));
}

// ---------------------------------------------------------------------------------------------------------------
// GLSL

const VERTEX_SHADER = /* glsl */ `
#include <skinning_pars_vertex>

// Unity uv1 (particle custom data / second UV set). vec4 so particle custom streams keep z/w.
#ifdef USE_UV1
	#define RW_UV1 vec4(uv1, 0.0, 0.0)
#else
	attribute vec4 uv1;
	#define RW_UV1 uv1
#endif

#if defined(USE_COLOR_ALPHA)
	#define RW_VCOLOR color
#elif defined(USE_COLOR)
	#define RW_VCOLOR vec4(color, 1.0)
#elif defined(USE_VERTEX_COLOR)
	attribute vec4 color;
	#define RW_VCOLOR color
#else
	#define RW_VCOLOR vec4(1.0)
#endif

#ifdef RW_SPRITE
	uniform vec4 _Flip;
#endif

varying vec3 vWorldPos;
varying vec3 vNormalWS;
varying vec3 vObjPos;
varying vec2 vUv0;
varying vec4 vUv1;
varying vec4 vColor;
varying vec4 vClipPos;

void main() {
	vec3 objectNormal = vec3(normal);
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	vec3 transformed = vec3(position);
	#ifdef RW_SPRITE
		transformed.xy *= _Flip.xy; // UnityFlipSprite
	#endif
	#include <skinning_vertex>
	vObjPos = transformed;
	vec4 localPos = vec4(transformed, 1.0);
	#ifdef USE_INSTANCING
		localPos = instanceMatrix * localPos;
		objectNormal = mat3(instanceMatrix) * objectNormal;
	#endif
	vec4 worldPos = modelMatrix * localPos;
	vWorldPos = worldPos.xyz;
	if (dot(objectNormal, objectNormal) > 1e-12) {
		// inverse-transpose world normal (works with non-uniform scale)
		vNormalWS = normalize((vec4(normalMatrix * objectNormal, 0.0) * viewMatrix).xyz);
	} else {
		// meshes without normals (particles, trails): face the camera
		vNormalWS = normalize(cameraPosition - worldPos.xyz);
	}
	vUv0 = uv;
	vUv1 = RW_UV1;
	vColor = RW_VCOLOR;
	gl_Position = projectionMatrix * viewMatrix * worldPos;
	vClipPos = gl_Position;
}
`;

const FRAG_COMMON = /* glsl */ `
uniform vec4 uTime;
uniform vec4 uSinTime;

varying vec3 vWorldPos;
varying vec3 vNormalWS;
varying vec3 vObjPos;
varying vec2 vUv0;
varying vec4 vUv1;
varying vec4 vColor;
varying vec4 vClipPos;

#define RW_TIME (uTime.y)

float sat(float x) { return clamp(x, 0.0, 1.0); }
vec2 sat(vec2 x) { return clamp(x, 0.0, 1.0); }
vec3 sat(vec3 x) { return clamp(x, 0.0, 1.0); }

// HLSL smoothstep semantics (equal edges act as a step, reversed edges allowed)
float rwSmoothstep(float a, float b, float x) {
	float d = b - a;
	float t = (d == 0.0) ? ((x - a) > 0.0 ? 1.0 : 0.0) : clamp((x - a) / d, 0.0, 1.0);
	return t * t * (3.0 - 2.0 * t);
}
vec3 rwSmoothstep(float a, float b, vec3 x) {
	return vec3(rwSmoothstep(a, b, x.x), rwSmoothstep(a, b, x.y), rwSmoothstep(a, b, x.z));
}

// Shader Graph Colorspace Conversion node, Linear -> RGB (12.92 slope)
vec3 SGLinearToSRGB(vec3 c) {
	vec3 lo = c * 12.92;
	vec3 hi = pow(abs(c), vec3(1.0 / 2.4)) * 1.055 - 0.055;
	return mix(hi, lo, vec3(lessThanEqual(c, vec3(0.0031308))));
}

// Unity-space positions (Z mirrored back)
vec3 rwPositionWS() { return vec3(vWorldPos.xy, -vWorldPos.z); }
vec3 rwPositionOS() { return vec3(vObjPos.xy, -vObjPos.z); }
// view space is identical in three and Unity (UNITY_MATRIX_V)
vec3 rwPositionVS() { return (viewMatrix * vec4(vWorldPos, 1.0)).xyz; }
// three-space directions (only used in mirror-invariant ways)
vec3 rwNormalWS() { return normalize(vNormalWS); }
vec3 rwViewDirWS() { vec3 v = cameraPosition - vWorldPos; return v * inversesqrt(max(dot(v, v), 1e-20)); }
// Screen Position node (Default): 0..1, origin bottom-left (GL)
vec2 rwScreenUV() { return (vClipPos.xy / vClipPos.w) * 0.5 + 0.5; }
// matcap: world normal -> view space, xy * 0.5 + 0.5
vec2 rwMatcapUV(vec3 nWS) { return (viewMatrix * vec4(nWS, 0.0)).xy * 0.5 + 0.5; }
// Fresnel Effect node
float rwFresnel(float power) { return pow(1.0 - sat(dot(rwNormalWS(), rwViewDirWS())), power); }
// Rotate node (degrees): uv = mul(uv - c, float2x2(c, -s, s, c)) + c
vec2 rwRotateDeg(vec2 uv, vec2 center, float rotation) {
	rotation = rotation * (3.1415926 / 180.0);
	uv -= center;
	float s = sin(rotation);
	float c = cos(rotation);
	uv = vec2(uv.x * c + uv.y * s, -uv.x * s + uv.y * c);
	return uv + center;
}
// RWBackgroundBand: smoothstep(0, 1, (edge - value) / smoothness)
float rwBand(float edge, float value, float smoothness) {
	return smoothstep(0.0, 1.0, (1.0 / smoothness) * (edge - value));
}
`;

// URP 12 UniversalFragmentPBR (gamma color space), compact:
// GI = flat white ambient (bakedGI = 1), indirect specular = uEnvReflection, one directional light (GGX, mobile clamp).
const LIT_CHUNK = /* glsl */ `
uniform vec3 uMainLightDir;
uniform vec3 uMainLightColor;
uniform vec3 uEnvReflection;

// kDielectricSpec under UNITY_COLORSPACE_GAMMA
#define RW_DIELECTRIC_SPEC 0.220916301
#define RW_DIELECTRIC_A (1.0 - 0.220916301)

vec4 rwLitPBR(vec3 albedo, float metallic, vec3 specColor, float smoothness, float occlusion, vec3 emission, float alpha) {
	vec3 N = rwNormalWS();
	vec3 V = rwViewDirWS();
	vec3 L = uMainLightDir * inversesqrt(max(dot(uMainLightDir, uMainLightDir), 1e-20));
	metallic = sat(metallic);
	smoothness = sat(smoothness);
	alpha = sat(alpha);
#ifdef _SPECULAR_SETUP
	float reflectivity = max(max(specColor.r, specColor.g), specColor.b);
	float oneMinusReflectivity = 1.0 - reflectivity;
	vec3 brdfDiffuse = albedo * (vec3(1.0) - specColor);
	vec3 brdfSpecular = specColor;
#else
	float oneMinusReflectivity = RW_DIELECTRIC_A - metallic * RW_DIELECTRIC_A;
	float reflectivity = 1.0 - oneMinusReflectivity;
	vec3 brdfDiffuse = albedo * oneMinusReflectivity;
	vec3 brdfSpecular = mix(vec3(RW_DIELECTRIC_SPEC), albedo, metallic);
#endif
	float perceptualRoughness = 1.0 - smoothness;
	float roughness = max(perceptualRoughness * perceptualRoughness, 0.0078125);
	float roughness2 = max(roughness * roughness, 6.103515625e-5);
	float grazingTerm = sat(smoothness + reflectivity);
	float normalizationTerm = roughness * 4.0 + 2.0;
	float roughness2MinusOne = roughness2 - 1.0;
#ifdef _ALPHAPREMULTIPLY_ON
	brdfDiffuse *= alpha;
	alpha = alpha * oneMinusReflectivity + reflectivity;
#endif
	// GlobalIllumination
	float NoV = sat(dot(N, V));
	float fresnelTerm = 1.0 - NoV;
	fresnelTerm *= fresnelTerm;
	fresnelTerm *= fresnelTerm;
	vec3 indirectDiffuse = vec3(occlusion); // bakedGI = 1 (flat white trilight)
#ifdef _ENVIRONMENTREFLECTIONS_OFF
	vec3 indirectSpecular = vec3(occlusion); // _GlossyEnvironmentColor = ambient (white)
#else
	vec3 indirectSpecular = uEnvReflection * occlusion;
#endif
	float surfaceReduction = 1.0 / (roughness2 + 1.0);
	vec3 color = indirectDiffuse * brdfDiffuse
		+ indirectSpecular * (surfaceReduction * mix(brdfSpecular, vec3(grazingTerm), fresnelTerm));
	// main directional light
	float NdotL = sat(dot(N, L));
	vec3 radiance = uMainLightColor * NdotL;
	vec3 brdf = brdfDiffuse;
#ifndef _SPECULARHIGHLIGHTS_OFF
	vec3 H = L + V;
	H *= inversesqrt(max(dot(H, H), 1.175494e-38));
	float NoH = sat(dot(N, H));
	float LoH = sat(dot(L, H));
	float d = NoH * NoH * roughness2MinusOne + 1.00001;
	float specularTerm = roughness2 / ((d * d) * max(0.1, LoH * LoH) * normalizationTerm);
	specularTerm = clamp(specularTerm - 6.103515625e-5, 0.0, 100.0); // SHADER_API_MOBILE
	brdf += brdfSpecular * specularTerm;
#endif
	color += brdf * radiance;
	color += emission;
	return vec4(color, alpha);
}

// URP 12 UniversalFragmentBlinnPhong (Simple Lit)
vec4 rwLitBlinnPhong(vec3 albedo, vec3 specular, float smoothness, vec3 emission, float alpha) {
	vec3 N = rwNormalWS();
	vec3 V = rwViewDirWS();
	vec3 L = uMainLightDir * inversesqrt(max(dot(uMainLightDir, uMainLightDir), 1e-20));
	vec3 lightColor = uMainLightColor * sat(dot(N, L));
	vec3 color = (vec3(1.0) + lightColor) * albedo; // bakedGI (1) * albedo + lambert * albedo
#if defined(_SPECGLOSSMAP) || defined(_SPECULAR_COLOR)
	float shininess = exp2(10.0 * smoothness + 1.0);
	vec3 H = L + V;
	H *= inversesqrt(max(dot(H, H), 1.175494e-38));
	float NdotH = sat(dot(N, H));
	color += uMainLightColor * specular * pow(NdotH, shininess);
#endif
	return vec4(color + emission, alpha);
}
`;

// ---------------------------------------------------------------------------------------------------------------
// Render state helpers

const F = {
	zero: THREE.ZeroFactor, one: THREE.OneFactor, srcA: THREE.SrcAlphaFactor, omsa: THREE.OneMinusSrcAlphaFactor,
	srcC: THREE.SrcColorFactor,
};
const BLEND = {
	opaque: null,
	alpha: [F.srcA, F.omsa, F.one, F.omsa], // Blend SrcAlpha OneMinusSrcAlpha, One OneMinusSrcAlpha
	add: [F.srcA, F.one, F.one, F.one], // Blend SrcAlpha One, One One
	addLegacy: [F.srcA, F.one, F.srcA, F.one], // Blend SrcAlpha One
	alphaLegacy: [F.srcA, F.omsa, F.srcA, F.omsa], // Blend SrcAlpha OneMinusSrcAlpha
	premul: [F.one, F.omsa, F.one, F.omsa], // Blend One OneMinusSrcAlpha
	mul: [F.zero, F.srcC, F.zero, F.srcC], // Blend Zero SrcColor
};
// UnityEngine.Rendering.BlendMode
const UNITY_BLEND_FACTOR = [
	THREE.ZeroFactor, THREE.OneFactor, THREE.DstColorFactor, THREE.SrcColorFactor, THREE.OneMinusDstColorFactor,
	THREE.SrcAlphaFactor, THREE.OneMinusSrcColorFactor, THREE.DstAlphaFactor, THREE.OneMinusDstAlphaFactor,
	THREE.SrcAlphaSaturateFactor, THREE.OneMinusSrcAlphaFactor,
];
function unityBlend(src, dst) {
	src = Math.round(src); dst = Math.round(dst);
	if (src === 1 && dst === 0) return 'opaque';
	const s = UNITY_BLEND_FACTOR[src] ?? THREE.OneFactor;
	const d = UNITY_BLEND_FACTOR[dst] ?? THREE.ZeroFactor;
	return [s, d, s, d];
}
// UnityEngine.Rendering.CullMode: 0 Off, 1 Front, 2 Back
function unityCull(v) {
	v = Math.round(v ?? 2);
	return v === 0 ? 'off' : v === 1 ? 'front' : 'back';
}

const ST = (blend, cull = 'back', zwrite = blend === 'opaque', ztest = 'lequal') => () => ({ blend, cull, zwrite, ztest });

// ---------------------------------------------------------------------------------------------------------------
// Shader Graph registry: frag = GLSL (uniform declarations are generated from the property table)

const BACKGROUND_ALIASES = /* glsl */ `
#define TexBrightness Vector1_6a03dbb1b42040d58458f1c68fe848c7
#define ColorFront Color_e8ca45589c5041d4a9e083ab137612a4_2
#define ColorMid Color_e8ca45589c5041d4a9e083ab137612a4
#define ColorBack Color_e8ca45589c5041d4a9e083ab137612a4_1
#define DistanceFront Vector1_beaf53ac25dd4549911d7da657df018a
#define DistanceBack Vector1_8fcc19aba6ba459899b062a5a1621b47
#define BgTex Texture2D_cded4512818846cbaecf8c4964ca8a72
`;

const REG = {};

// ---- Lit roads ------------------------------------------------------------------------------------------------

REG['Shader Graphs_Roads'] = {
	lit: true, state: ST('opaque'),
	frag: /* glsl */ `
void main() {
	vec3 mask = texture2D(Texture2D_a7f42867e2214dd4878c924659a73941, vUv0).rgb;
	vec3 baseColor = mix(_PrimaryColor.rgb, _SecondaryColor.rgb, mask);
	vec3 emission = mix(SGLinearToSRGB(_PrimaryEmission.rgb), SGLinearToSRGB(_SecondaryEmission.rgb), mask);
	gl_FragColor = rwLitPBR(baseColor, 0.0, vec3(0.0), 0.5, 1.0, emission, 1.0);
}`,
};

REG['Shader Graphs_Roads_Glass'] = {
	lit: true, state: ST('alpha'),
	frag: /* glsl */ `
void main() {
	float fresnel = rwFresnel(Vector1_68d76f3157424fb883bc3c3c08ebc977);
	vec3 positionOS = rwPositionOS();
	vec3 positionVS = rwPositionVS();
	vec3 positionWS = rwPositionWS();
	vec2 normalUV = ((positionOS.xy + positionOS.xz) + positionVS.xy * 0.25) * Vector2_1249dee7d46c41e8a4ae430cf84319ed.xy;
	vec2 distortion = texture2D(Texture2D_e11bbcd700174b3aa2627eb3f92444b9, normalUV).xy * Vector1_8cb173a3150d4feab59f840b5471b4ae;
	vec3 tex = texture2D(Texture2D_b1f9528e5fe4437c885efc1b24e40d59, distortion).rgb;
	vec2 shineUV = (positionVS.xy + positionWS.xy) * Vector2_2.xy + Vector2_3.xy;
	vec3 shine = texture2D(Texture2D_3ec162dadf9c4969a711b436d999a0c5, shineUV).rgb;
	vec3 baseColor = fresnel * SGLinearToSRGB(Color_e35eeb5d244e4f4fa1a434eb4a69befb.rgb);
	vec3 emission = SGLinearToSRGB(Color_b2c8d87c0e9449d6b9fe250f8731a329.rgb) * shine + (tex + Color_ddeec25da6f249a1b6e02cb565f13a9f.rgb);
	float alpha = sat(fresnel + (tex.b + tex.r));
	gl_FragColor = rwLitPBR(baseColor, 0.0, vec3(0.0), 0.5, 1.0, emission, alpha);
}`,
};

REG['Shader Graphs_Roads_Magnetic'] = {
	lit: true, state: ST('opaque'),
	frag: /* glsl */ `
void main() {
	vec3 positionWS = rwPositionWS();
	vec3 overlay = texture2D(OverlayTexture, positionWS.xy * Vector2_bc65fdad44894da9b709d0fdede5c536.xy).rgb;
	vec3 mask = texture2D(Texture2D_a7f42867e2214dd4878c924659a73941, vUv0).rgb;
	vec3 roadColor = mix(_PrimaryColor.rgb, _SecondaryColor.rgb, mask);
	vec3 roadEmission = mix(SGLinearToSRGB(_PrimaryEmission.rgb), SGLinearToSRGB(_SecondaryEmission.rgb), mask);
	vec3 baseColor = (overlay + 0.36) * OverlayColor.rgb * roadColor;
	vec3 emission = (overlay * 2.0 - 1.0) * SGLinearToSRGB(OverlayColorEmission.rgb) * roadEmission;
	gl_FragColor = rwLitPBR(baseColor, 0.0, vec3(0.0), 0.5, 1.0, emission, 1.0);
}`,
};

// ---- Lit props (RW_LitProps.hlsl: metallic 0, smoothness 0.5, occlusion 1) --------------------------------------

const BIKE_COLORS = /* glsl */ `
	vec3 diffuse = texture2D(_DiffuseMap, vUv0).rgb;
	vec4 mask = texture2D(_Mask, vUv0);
	float invA = 1.0 - mask.a;
	vec3 colors = (_ColorPrimary.rgb * mask.r + _ColorSecondary.rgb * mask.g)
		+ (_ColorPrimaryDark.rgb * mask.b + _ColorSecondaryDark.rgb * invA);
	float coverage = (mask.r + mask.g) + (mask.b + invA);
	vec3 albedo = mix(diffuse, colors, coverage);
`;

REG['Shader Graphs_Bikes'] = {
	lit: true, state: ST('opaque'),
	frag: /* glsl */ `
void main() {
${BIKE_COLORS}
	vec3 emissionTex = texture2D(_EmissionMap, vUv0).rgb;
	vec3 emission = mix(emissionTex, colors * _EmissionAmount, coverage);
	gl_FragColor = rwLitPBR(albedo, 0.0, vec3(0.0), 0.5, 1.0, emission, 1.0);
}`,
};

REG['Shader Graphs_Bikes_Special'] = {
	lit: true, state: ST('opaque'),
	frag: /* glsl */ `
void main() {
${BIKE_COLORS}
	vec3 normalWS = rwNormalWS();
	vec3 matcap = texture2D(_Texture_MatCap, rwMatcapUV(normalWS)).rgb;
	vec3 matcapMask = texture2D(_Texture_MatCap_Mask, vUv0).rgb;
	vec3 matcapAdd = matcapMask * matcap + albedo;
	vec3 matcapMul = sat(matcap - matcapMask + 1.0) * albedo;
	vec3 baseColor = (_Matcap_Additive != 0.0) ? matcapAdd : matcapMul;
	float fresnel = rwFresnel(Vector1_a95df7caa9f54e538b6f2e0d86f9dbda);
	vec3 fresnelMask = texture2D(Texture2D_b072c57e58fd4132b55de0767e45d02e, vUv0).rgb;
	vec3 fresnelTerm = fresnel * fresnelMask;
	vec2 positionOS = rwPositionOS().xy;
	vec3 overlayMaskUV = texture2D(_Texure_Overlay_Mask_UV, vUv0).rgb;
	vec2 overlayMaskCoord = positionOS * _Overlay_Mask_Tiling.xy + RW_TIME * Vector4_ab283b7ee70a45b9a1245c16606d4bdc_1.xy;
	vec3 overlayMask = texture2D(Texture2D_1, overlayMaskCoord).rgb;
	vec2 overlayCoord = positionOS * Vector2_1739477025ac401ebfba97a5f23593e8.xy + RW_TIME * Vector4_ab283b7ee70a45b9a1245c16606d4bdc.xy;
	vec3 overlay = texture2D(Texture2D_99b59bf9ca1448a7a4a7d86a4f895d76, overlayCoord).rgb;
	vec3 overlayTerm = overlayMaskUV * (overlay * overlayMask) * SGLinearToSRGB(_Overlay_Color.rgb);
	vec3 emission = SGLinearToSRGB(Color_45575abbd9da41d391c9f3f451c36480.rgb) * fresnelTerm + overlayTerm;
	gl_FragColor = rwLitPBR(baseColor, 0.0, vec3(0.0), 0.5, 1.0, emission, 1.0);
}`,
};

REG['Shader Graphs_Cannon'] = {
	lit: true, state: ST('opaque'),
	frag: /* glsl */ `
void main() {
	float fresnel = rwFresnel(_GlowStrength);
	vec3 tex = texture2D(_CannonTexture, vUv0).rgb;
	vec3 baseColor = _GlowColor.rgb * fresnel + tex;
	gl_FragColor = rwLitPBR(baseColor, 0.0, vec3(0.0), 0.5, 1.0, vec3(0.0), 1.0);
}`,
};

REG['Shader Graphs_HardCurrency'] = {
	lit: true, state: ST('opaque'),
	frag: /* glsl */ `
void main() {
	vec3 matcap = texture2D(Texture2D_cded4512818846cbaecf8c4964ca8a72_1, rwMatcapUV(rwNormalWS())).rgb;
	vec3 tex = texture2D(Texture2D_df6d74a2005c4719a8e64d9d9600fe95, vUv0).rgb;
	vec3 base = mix(Color_3ed065c46d094deaac4d50b32efc18a0.rgb, Color_acd33005c202438db81141a8465728db.rgb, tex);
	vec3 baseColor = matcap * matcap + base;
	vec2 shineUV = vUv1.xy * vec2(1.0, 0.075) + RW_TIME * Vector2_40d12c7403e14baa9abbb1ede167645b.xy;
	vec3 shine = texture2D(Texture2D_0e18113ac62346fd8432b75c99e69bfa, shineUV).rgb;
	vec3 emission = SGLinearToSRGB(Color_aa7cfa3569014970a6a6a97ad381ea98.rgb) * shine;
	gl_FragColor = rwLitPBR(baseColor, 0.0, vec3(0.0), 0.5, 1.0, emission, 1.0);
}`,
};

REG['Shader Graphs_Lootbox'] = {
	lit: true, state: ST('opaque'),
	frag: /* glsl */ `
void main() {
	vec3 diffuse = texture2D(_DiffuseMap, vUv0).rgb;
	vec3 lightColor = mix(Color_c877a6332d514559a5a807dfa530a493.rgb, _ColorOn.rgb, Vector1_cd11462755484a7c92cc144df0293726);
	float mask = texture2D(_Mask, vUv0).r;
	vec3 baseColor = mix(diffuse, lightColor * mask, mask);
	gl_FragColor = rwLitPBR(baseColor, 0.0, vec3(0.0), 0.5, 1.0, vec3(0.0), 1.0);
}`,
};

REG['Shader Graphs_BonusRide_Portal'] = {
	lit: true, state: ST('opaque', 'off'),
	frag: /* glsl */ `
void main() {
	vec2 positionVS = rwPositionVS().xy;
	vec2 uv = positionVS * Vector2_f849d0646ee44183a6a7baabe66e55d5.xy + RW_TIME * Vector2_133d8e07a40f4c488f43b63387874702.xy;
	vec3 tex = texture2D(Texture2D_2741f467f1544891a45008e02bbceb2e, uv).rgb;
	vec3 shading = texture2D(Texture2D_284e2105e94742d286240fc15fefd128, vUv1.xy).rgb;
	vec3 color = (tex * shading) * SGLinearToSRGB(Color_9a5d270665b84209bc6b861f78f38765.rgb);
	// alpha 0.5 clipped against a hard step along uv0.y
	float threshold = rwSmoothstep(Vector1_b6587cd9c3c24e0ba4212386a97efa27, Vector1_b6587cd9c3c24e0ba4212386a97efa27, vUv0.y);
	if (0.5 - threshold < 0.0) discard;
	gl_FragColor = rwLitPBR(color, 0.0, vec3(0.0), 0.5, 1.0, color, 0.5);
}`,
};

// ---- Unlit: matcap / backgrounds ------------------------------------------------------------------------------

REG['Shader Graphs_MatCap'] = {
	state: ST('alpha'),
	frag: /* glsl */ `
void main() {
	vec4 matcap = texture2D(Texture2D_cded4512818846cbaecf8c4964ca8a72_1, rwMatcapUV(rwNormalWS()));
	float mask = texture2D(Texture2D_cded4512818846cbaecf8c4964ca8a72_2, vUv0).a;
	gl_FragColor = vec4(matcap.rgb * Color_acd33005c202438db81141a8465728db.rgb, matcap.a * mask);
}`,
};

REG['Shader Graphs_Background'] = {
	state: ST('opaque'),
	frag: BACKGROUND_ALIASES + /* glsl */ `
void main() {
	vec3 p = rwPositionWS();
	float z = p.z;
	float heightBlend = rwBand(Vector1_d06007c0be3f400c8dae942e0568cf83, p.y, Vector1_423782c037ad4cbea6520795a48acef0);
	vec3 heightColor = mix(Color_1.rgb, Color_19324113c65049ee91a4531b835d17fb.rgb, heightBlend);
	float back = rwBand(DistanceBack, z, Vector1_1);
	float origin = rwBand(0.0, z, Vector1_1);
	float front = rwBand(DistanceFront, z, Vector1_1);
	vec3 color = mix(ColorBack.rgb, ColorMid.rgb, back);
	color = mix(color, vec3(0.0), origin);
	color = mix(color, ColorFront.rgb, front);
	color += back * heightColor;
	vec3 tex = texture2D(BgTex, vUv0).rgb;
	color *= 1.0 - (1.0 - tex) * (1.0 - TexBrightness);
	color = mix(ColorBack.rgb, color, back);
	gl_FragColor = vec4(color, 1.0);
}`,
};

REG['Shader Graphs_BackgroundBase'] = {
	state: ST('opaque'),
	frag: BACKGROUND_ALIASES + /* glsl */ `
void main() {
	float z = rwPositionWS().z;
	float back = rwBand(DistanceBack, z, Vector1_1);
	float origin = rwBand(0.0, z, Vector1_1);
	float front = rwBand(DistanceFront, z, Vector1_1);
	vec3 color = mix(ColorBack.rgb, ColorMid.rgb, back);
	color = mix(color, vec3(0.0), origin);
	color = mix(color, ColorFront.rgb, front);
	vec3 tex = texture2D(BgTex, vUv0).rgb;
	vec3 darken = (1.0 - tex) * (1.0 - TexBrightness);
	color *= 1.0 - back * darken;
	gl_FragColor = vec4(color, 1.0);
}`,
};

const BACKGROUND2_BODY = /* glsl */ `
	vec3 p = rwPositionWS();
	float z = p.z;
	float back = rwBand(DistanceBack, z, Vector1_1);
	float mid = rwBand(Vector1_cb69590c128e411f92274645b58ed524, z, Vector1_1);
	float front = rwBand(DistanceFront, z, Vector1_1);
	vec3 color = mix(ColorBack.rgb, ColorMid.rgb, back); // ColorMid2
	color = mix(color, Color_e8ca45589c5041d4a9e083ab137612a4_3.rgb, mid); // ColorMid1
	color = mix(color, ColorFront.rgb, front);
	float top = rwBand(Vector1_d06007c0be3f400c8dae942e0568cf83, p.y, Vector1_423782c037ad4cbea6520795a48acef0);
	float bottom = rwBand(Vector1_d06007c0be3f400c8dae942e0568cf83_1, p.y, Vector1_423782c037ad4cbea6520795a48acef0);
	vec3 heightColor = color + mix(Color_1.rgb, vec3(0.0), top);
	heightColor *= mix(vec3(1.0), Color_19324113c65049ee91a4531b835d17fb.rgb, bottom);
	vec3 tex = texture2D(BgTex, vUv0).rgb;
	heightColor *= 1.0 - (1.0 - tex) * (1.0 - TexBrightness);
`;

REG['Shader Graphs_Background_2'] = {
	state: ST('opaque'),
	frag: BACKGROUND_ALIASES + /* glsl */ `
void main() {
${BACKGROUND2_BODY}
	color = mix(ColorBack.rgb, heightColor, back);
	gl_FragColor = vec4(color, 1.0);
}`,
};

REG['Shader Graphs_Background_2_Glass'] = {
	state: ST('opaque'),
	frag: BACKGROUND_ALIASES + /* glsl */ `
void main() {
${BACKGROUND2_BODY}
	vec3 positionVS = rwPositionVS();
	vec2 glassUV = (positionVS.xy + p.xy) * Vector2_ba89400d91dd431ea839a7eeb0437a94.xy + Vector2_ba89400d91dd431ea839a7eeb0437a94_1.xy;
	vec3 glass = texture2D(Texture2D_a9bbafba50f54cef9f954e29fa940bb4, glassUV).rgb;
	heightColor = Color_fd5916f3773e47e386fe18b4b9783671.rgb * glass + heightColor;
	color = mix(ColorBack.rgb, heightColor, back);
	gl_FragColor = vec4(color, 1.0);
}`,
};

REG['Shader Graphs_Background_ScrollingOverlay'] = {
	state: ST('opaque'),
	frag: BACKGROUND_ALIASES + /* glsl */ `
void main() {
	vec3 p = rwPositionWS();
	float z = p.z;
	float fresnel = 1.0 - sat(dot(rwNormalWS(), rwViewDirWS()));
	vec3 overlay = fresnel * Color_c49685c7562f4a75b9a43f6a419cf4fc.rgb;
	vec2 tiledUV = vUv0 * Vector2_cc8e82042aee4a15a6c5622362403828.xy;
	vec2 overlayUV = RW_TIME * Vector2_7cbb5ada2fb04729863452a1b4639891.xy + tiledUV;
	vec2 maskUV = RW_TIME * Vector2_1.xy + tiledUV;
	vec3 mask = texture2D(Texture2D_97bb4cce4a6448c9a452aba25d079f24, maskUV).rgb;
	vec3 overlayTex = texture2D(Texture2D_9033b35b109648d18b15d550d4faf493, overlayUV).rgb;
	overlay += overlayTex * Color_f3d93fcef13b4062809b532179c1acc8.rgb * mask;
	float heightBlend = rwBand(Vector1_d06007c0be3f400c8dae942e0568cf83, p.y, Vector1_423782c037ad4cbea6520795a48acef0);
	vec3 heightColor = mix(Color_1.rgb, Color_19324113c65049ee91a4531b835d17fb.rgb, heightBlend);
	float back = rwBand(DistanceBack, z, Vector1_1);
	float origin = rwBand(0.0, z, Vector1_1);
	float front = rwBand(DistanceFront, z, Vector1_1);
	vec3 color = mix(ColorBack.rgb, ColorMid.rgb, back);
	color = mix(color, vec3(0.0), origin);
	color = mix(color, ColorFront.rgb, front);
	color += back * heightColor;
	vec3 tex = texture2D(BgTex, vUv0).rgb;
	vec3 darken = (1.0 - tex) * (1.0 - TexBrightness);
	color = (1.0 - back * darken) * color + overlay;
	gl_FragColor = vec4(color, 1.0);
}`,
};

const BACKGROUND_METALLIC = /* glsl */ `
float rwSmoothFalloff(float x) { float t = sat(x); return t * t * (3.0 - 2.0 * t); }
vec3 rwBackgroundMetallic(float depthZ, vec3 baseTex, vec3 maskTex, vec3 matcapTex,
		vec3 colorFront, vec3 colorMid, vec3 colorBack, float distanceFront, float distanceBack, float invFalloff) {
	float fadeNear = rwSmoothFalloff(invFalloff * -depthZ);
	float fadeBack = rwSmoothFalloff(invFalloff * (distanceBack - depthZ));
	float fadeFront = rwSmoothFalloff(invFalloff * (distanceFront - depthZ));
	vec3 gradient = mix(colorBack, colorMid, fadeBack);
	gradient = mix(gradient, vec3(0.0), fadeNear);
	gradient = mix(gradient, colorFront, fadeFront);
	vec3 matcap = mix(colorBack, matcapTex * (maskTex * baseTex), fadeBack);
	return (fadeBack * baseTex) * gradient + matcap;
}
`;
const backgroundMetallicFrag = (matcapUV) => BACKGROUND_ALIASES + BACKGROUND_METALLIC + /* glsl */ `
void main() {
	vec3 matcapTex = texture2D(Texture2D_cded4512818846cbaecf8c4964ca8a72_1, ${matcapUV}).rgb;
	vec3 maskTex = texture2D(Texture2D_cded4512818846cbaecf8c4964ca8a72_2, vUv0).rgb;
	vec3 baseTex = texture2D(BgTex, vUv0).rgb;
	vec3 color = rwBackgroundMetallic(rwPositionWS().z, baseTex, maskTex, matcapTex,
		ColorFront.rgb, ColorMid.rgb, ColorBack.rgb, DistanceFront, DistanceBack,
		1.0 / Vector1_27dcd979a2cd483b9e450994d5bb8145);
	gl_FragColor = vec4(color, 1.0);
}`;
REG['Shader Graphs_Background_MetallicMatcap'] = { state: ST('opaque'), frag: backgroundMetallicFrag('rwMatcapUV(rwNormalWS())') };
REG['Shader Graphs_Background_MetallicScreen'] = { state: ST('opaque'), frag: backgroundMetallicFrag('rwScreenUV()') };

// ---- Unlit: overlays / world effects ---------------------------------------------------------------------------

REG['Shader Graphs_ScrollingOverlay'] = {
	state: ST('add'),
	frag: /* glsl */ `
void main() {
	vec2 tiled = vUv0 * Vector2_cc8e82042aee4a15a6c5622362403828.xy;
	vec2 uvOverlay = tiled + RW_TIME * Vector2_7cbb5ada2fb04729863452a1b4639891.xy;
	vec2 uvMask = tiled + RW_TIME * Vector2_1.xy;
	vec3 overlay = texture2D(Texture2D_9033b35b109648d18b15d550d4faf493, uvOverlay).rgb;
	vec3 mask = texture2D(Texture2D_97bb4cce4a6448c9a452aba25d079f24, uvMask).rgb;
	gl_FragColor = vec4(mask * (overlay * ColorOverlay.rgb), vColor.a);
}`,
};

REG['Shader Graphs_GravityField'] = {
	state: ST('alpha'),
	frag: /* glsl */ `
void main() {
	vec2 uv = vUv0;
	vec2 move = _Time_Anim * _Movement_Speed.xy;
	vec3 sparksColor = SGLinearToSRGB(_Sparks_Color.rgb);
	float sparkFast = texture2D(_Sparks_Tex, rwRotateDeg(uv * _Tiling_sparks.xy + move * _Speed_Sparks.xy, vec2(0.5), _Rotate)).g;
	float sparkSlow = texture2D(_Sparks_Tex, rwRotateDeg(uv * _Tiling_sparks.xy + move, vec2(0.5), _Rotate)).r;
	vec3 sparks = sparkSlow * sparksColor + sparksColor * 0.292452812 * sparkFast;
	float sparksMask = sparkFast + sparkSlow;
	vec3 mainTex = texture2D(_Texture_Main, rwRotateDeg(uv * _Tiling_Main.xy + move, vec2(0.5), _Rotate)).rgb;
	vec3 background = mix(SGLinearToSRGB(_Background_color.rgb), _Color_Background_Off.rgb, _Activate_off_state) * (1.0 - mainTex);
	vec3 mainColor = mix(SGLinearToSRGB(_Color_Main.rgb), _Color_Main_Off.rgb, _Activate_off_state);
	vec3 baseColor = mainTex * mainColor + background;
	vec3 color = mix(sparks * _Sparks_Color.a + baseColor, baseColor, _Activate_off_state);
	vec2 gradientUV = rwRotateDeg(uv, vec2(0.5), _Rotate - 90.0) * vec2(0.2, 1.0) + _Gradient_Anim;
	vec3 gradient = texture2D(_Gradient_Mask, gradientUV).rgb * _Gradient_Color.a;
	color = _Gradient_Color.rgb * gradient + color;
	float backgroundAlpha = mix(_Background_color.a, _Color_Background_Off.a, _Activate_off_state) * (1.0 - mainTex.r);
	float mainAlpha = mix(_Color_Main.a, _Color_Main_Off.a, _Activate_off_state);
	float baseAlpha = mainTex.r * mainAlpha + backgroundAlpha;
	float alpha = mix(sparksMask * _Sparks_Color.a + baseAlpha, baseAlpha, _Activate_off_state);
	alpha += sat(gradient.r);
	alpha *= texture2D(_Texture_Mask, uv).r;
	gl_FragColor = vec4(color, alpha);
}`,
};

const LIGHTBEAM_ALIASES = /* glsl */ `
#define BeamTex Texture2D_9033b35b109648d18b15d550d4faf493
#define TilingOverlay Vector2_cc8e82042aee4a15a6c5622362403828
#define TilingDistortion Vector2_cc8e82042aee4a15a6c5622362403828_2
#define ScrollOverlay Vector2_7cbb5ada2fb04729863452a1b4639891
#define ScrollDistortion Vector2_1
`;

REG['Shader Graphs_Bunker_Lightbeam'] = {
	state: ST('add'),
	frag: LIGHTBEAM_ALIASES + /* glsl */ `
void main() {
	vec2 pos = rwPositionWS().xy;
	vec2 distortUV = pos * TilingDistortion.xy + RW_TIME * ScrollDistortion.xy;
	float distortion = texture2D(BeamTex, distortUV).r;
	vec2 overlayUV = (distortion + pos) * TilingOverlay.xy + RW_TIME * ScrollOverlay.xy;
	float overlay = texture2D(BeamTex, overlayUV).b;
	float mask = texture2D(BeamTex, vUv0).g;
	gl_FragColor = vec4(overlay * ColorOverlay.rgb * mask, ColorOverlay.a);
}`,
};

REG['Shader Graphs_Bunker_Lightbeam_Door'] = {
	state: ST('alpha', 'off'),
	frag: LIGHTBEAM_ALIASES + /* glsl */ `
void main() {
	vec2 posOS = rwPositionOS().yx;
	vec2 distortUV = posOS * TilingDistortion.xy + RW_TIME * ScrollDistortion.xy;
	float distortion = texture2D(BeamTex, distortUV).r;
	vec2 overlayUV = (distortion + posOS) * TilingOverlay.xy + RW_TIME * ScrollOverlay.xy;
	float overlay = texture2D(BeamTex, overlayUV).b;
	float mask = texture2D(BeamTex, vUv0).g;
	gl_FragColor = vec4(_Color.rgb, overlay * mask * _Color.a);
}`,
};

REG['Shader Graphs_Reactor_Beam'] = {
	state: ST('add'),
	frag: /* glsl */ `
#define BeamColor Color_e8ca45589c5041d4a9e083ab137612a4_1
#define FlickerFade Vector2_3042803bb77f4ac5b161f1eda36d78dd
void main() {
	float fresnel = 1.0 - sat(dot(rwNormalWS(), rwViewDirWS()));
	float facing = rwSmoothstep(0.0, Vector1_703bad392195426ab400619356be8972, 1.0 - fresnel);
	vec2 uv = Vector2_0131f92bca074749b70052292cf9fc04.xy * RW_TIME + vUv0;
	vec3 tex = texture2D(Texture2D_cded4512818846cbaecf8c4964ca8a72, uv).rgb;
	vec3 color = facing * (tex * BeamColor.rgb);
	float flicker = FlickerFade.x + (sin(RW_TIME * Vector1_4f72f6f11bf3404986e7aa5b29243688) - 1.0) * (FlickerFade.y - FlickerFade.x) * -0.5;
	float alpha = (Boolean_1b1afcb0ec244bc699bc522ed89b771f != 0.0) ? flicker : 1.0;
	gl_FragColor = vec4(color, alpha);
}`,
};

REG['Shader Graphs_Reactor_WorldEffect'] = {
	state: ST('add'),
	frag: /* glsl */ `
void main() {
	vec2 pos = rwPositionWS().xy;
	vec2 noise = texture2D(Texture2D_0717d1666a2c49bebbd11fe7b74323bc, pos * Vector2_2622aceb100e4c30a15943658bae6c8b.xy).rg;
	vec2 uv = (noise + pos) * Vector2_1.xy + RW_TIME * Vector2_24d513b04e814f47853a18c965f46cc0.xy;
	vec3 tex = texture2D(Texture2D_8c981c34314c421791f22dc9d783d309, uv).rgb;
	vec3 color = mix(Color_bfe11d60aac447caba3e82728c37d851.rgb, Color_1b76d33f9e074994918aa2755dd19782.rgb, tex);
	gl_FragColor = vec4(color, vColor.a);
}`,
};

REG['Shader Graphs_WarpDrive_WorldEffect'] = {
	state: ST('add'),
	frag: /* glsl */ `
void main() {
	vec2 pos = rwPositionWS().xy;
	vec2 uv1 = pos * Vector2_1.xy + RW_TIME * Vector2_24d513b04e814f47853a18c965f46cc0.xy;
	vec2 uv2 = pos * Vector2_d31589ae61234f099782fea6d4ebe06f.xy + RW_TIME * Vector2_673de8c33b704c48bf62b1c21befaade.xy;
	vec3 layer1 = texture2D(Texture2D_8c981c34314c421791f22dc9d783d309, uv1).rgb;
	vec3 layer2 = texture2D(Texture2D_86531ce8183e4eddb17b61ce81bbd85b, uv2).rgb;
	vec3 color = mix(Color_bfe11d60aac447caba3e82728c37d851.rgb, Color_1b76d33f9e074994918aa2755dd19782.rgb, layer1 + layer2);
	float alpha = texture2D(Texture2D_22d3557725e94d4db5de9637ed856579, vUv0).a;
	gl_FragColor = vec4(color, alpha);
}`,
};

REG['Shader Graphs_Lootbox_Light'] = {
	state: ST('add', 'off'),
	frag: /* glsl */ `
void main() {
	vec4 tex = texture2D(Texture2D_2741f467f1544891a45008e02bbceb2e, vUv0) * vColor;
	float alpha = tex.a * tex.a * _Color.a * Vector1_fc1e85b819d442d8916e1a84994a556c;
	gl_FragColor = vec4(tex.rgb * _Color.rgb, alpha);
}`,
};

REG['Shader Graphs_WorldSpaceMask_Dissolve'] = {
	state: ST('alpha'),
	frag: /* glsl */ `
void main() {
	vec2 maskUV = rwPositionWS().xy * Vector2_05984ac97ef445a0b8080b4989ef38e3.xy + Vector2_4bd351478aec4703bb98cece8e0d5129.xy;
	float mask = texture2D(Texture2D_43ea15fbb3ea4bb4b95a30a92dc732a9, maskUV).r;
	float dissolve = rwSmoothstep(vUv1.x, vUv1.x, mask);
	float tex = texture2D(Texture2D_81515f3383b74fffacc9fbf2fc4d8947, vUv0).r;
	vec3 color = SGLinearToSRGB(Color_2bfba747758f42d4813adb14e8baea1d.rgb) * vColor.rgb;
	gl_FragColor = vec4(color, dissolve * tex * vColor.a);
}`,
};

REG['Shader Graphs_Scrolling_Pixel_Hologram'] = {
	state: ST('alpha', 'off'),
	frag: /* glsl */ `
void main() {
	vec2 screenUV = rwScreenUV();
	float mask = texture2D(_Texture_Mask, screenUV * _TIling_Mask.xy + RW_TIME * _Scrollspeed_Mask.xy).r;
	vec2 pixelUV = floor(vUv0 * _PixelDensity) / _PixelDensity;
	float pattern = texture2D(_Texture, pixelUV * _Tiling.xy + RW_TIME * _Scrollspeed.xy).r;
	vec3 color = SGLinearToSRGB(_Color.rgb) * vColor.rgb;
	gl_FragColor = vec4(color, mask * pattern * vColor.a);
}`,
};

REG['Shader Graphs_Death_Helix'] = {
	state: ST('add', 'off'),
	frag: /* glsl */ `
void main() {
	vec3 mainColor = SGLinearToSRGB(_Color_Main.rgb);
	vec3 secondaryColor = SGLinearToSRGB(_Color_Secondary.rgb);
	vec2 uvRG = vUv0 * _Tiling_RG.xy + vec2(0.0, vUv1.x);
	vec2 uvB = vUv0 * _Tiling_B.xy + vec2(0.0, vUv1.y);
	float strandB = texture2D(_Texture, uvB).z;
	vec2 strandsRG = texture2D(_Texture, uvRG).xy;
	vec3 color = strandsRG.x * mainColor + secondaryColor * (strandB * strandsRG.y);
	gl_FragColor = vec4(color * vColor.rgb, vColor.a);
}`,
};

// ---- Trails -----------------------------------------------------------------------------------------------------

REG['Shader Graphs_Trail_Scrolling'] = {
	state: ST('alpha'),
	frag: /* glsl */ `
void main() {
	vec2 uv = vec2(min(pow(max(vUv0.x, 0.0), 0.75), 1.0), vUv0.y);
	uv = uv * _Tiling.xy + RW_TIME * _Scrolling_Speed.xy;
	float mask = texture2D(_Texture, uv).r;
	vec3 color = SGLinearToSRGB(_Color.rgb) * vColor.rgb;
	gl_FragColor = vec4(color, mask * vColor.a);
}`,
};

REG['Shader Graphs_Trail_Scrolling_UVdistortion'] = {
	state: ST('alpha'),
	frag: /* glsl */ `
void main() {
	vec2 distortion = texture2D(_Distortion, rwPositionWS().xy * _Distortion_Tiling.xy).xy;
	distortion = distortion * 2.0 - 1.0;
	vec2 uv = distortion / _Distortion_Amount + vUv0;
	uv = uv * _Tiling.xy + RW_TIME * _Scrolling_Speed.xy;
	float mask = texture2D(_Texture, uv).r;
	vec3 color = SGLinearToSRGB(_Color.rgb) * vColor.rgb;
	gl_FragColor = vec4(color, mask * vColor.a);
}`,
};

REG['Shader Graphs_Trail_Helix'] = {
	state: ST('add'),
	frag: /* glsl */ `
void main() {
	vec3 mainColor = SGLinearToSRGB(_Color_Main.rgb);
	vec3 secondaryColor = SGLinearToSRGB(_Color_Secondary.rgb);
	vec2 tiledUV = vUv0 * _Tiling.xy;
	vec2 strandsRG = texture2D(_Texture, RW_TIME * _Scrolling_Speed.xy + tiledUV).xy;
	float strandB = texture2D(_Texture, RW_TIME * _Scrolling_Speed_2.xy + tiledUV).z;
	float gradient = strandsRG.y * (vUv0.x - 0.5);
	float mainMask = gradient + strandsRG.x;
	float secondaryMask = strandsRG.y * strandB + sat(gradient);
	vec3 color = mainMask * mainColor + secondaryColor * secondaryMask;
	gl_FragColor = vec4(color * vColor.rgb, vColor.a);
}`,
};

REG['Shader Graphs_Trail_Light'] = {
	state: ST('alpha'),
	frag: /* glsl */ `
#define NoiseTex Texture2D_161cc36a2247464a82d988c5fe7f7650
void main() {
	vec2 uv = vUv0;
	vec2 tiledUV = uv * Vector2_a62120b08bb74720860b21e30b58b908.xy;
	float noiseR = texture2D(NoiseTex, tiledUV + vec2(RW_TIME * _ScrollSpeed_R.x, 0.3)).r;
	float noiseG = texture2D(NoiseTex, tiledUV + vec2(RW_TIME * _ScrollSpeed_G.x, -0.3)).r;
	float noiseB = texture2D(NoiseTex, tiledUV + vec2(RW_TIME * _ScrollSpeed_B.x, 0.0)).r;
	float noise = noiseG * noiseR * noiseB;
	vec2 sizes = vec2(_Base_Gradient_Size, _Edge_Mask_Size);
	vec2 gradient = sat((uv - sizes) / (1.0 - sizes));
	float edgeTop = sat(((1.0 - uv.y) - _Edge_Mask_Size) / (1.0 - _Edge_Mask_Size));
	float edgeMask = 1.0 - (edgeTop + gradient.y);
	float alpha = sat((noise * 10.0 + gradient.x) * edgeMask * vColor.a);
	vec3 overlay = texture2D(_Texture_Color_Overlay, tiledUV + _ScrollSpeed_Color_Overlay.xy * RW_TIME).rgb;
	float luma = dot(overlay, vec3(0.2126729, 0.7151522, 0.0721750));
	vec3 desaturated = luma + gradient.x * (overlay - luma);
	overlay = mix(desaturated, overlay, _Saturation_Amount);
	vec3 color = overlay * (SGLinearToSRGB(_Color.rgb) * vColor.rgb);
	gl_FragColor = vec4(color, alpha);
}`,
};

REG['Shader Graphs_Trail_Scrolling_RGB'] = {
	lit: true, state: ST('add'),
	frag: /* glsl */ `
#define TrailTex Texture2D_161cc36a2247464a82d988c5fe7f7650
#define ColorR Color_c05728de45304bd38c31a09d4b91c6f3
#define ColorG Color_c05728de45304bd38c31a09d4b91c6f3_2
#define ColorB Color_c05728de45304bd38c31a09d4b91c6f3_1
void main() {
	vec2 tiledUV = vUv0 * Vector2_a62120b08bb74720860b21e30b58b908.xy;
	vec2 uvR = RW_TIME * Vector2_cf3b16e33cfb44d09a5a545ddf076c6f.xy + tiledUV;
	vec2 uvG = RW_TIME * Vector2_cf3b16e33cfb44d09a5a545ddf076c6f_1.xy + tiledUV;
	vec2 uvB = RW_TIME * Vector2_cf3b16e33cfb44d09a5a545ddf076c6f_2.xy + tiledUV;
	float r = texture2D(TrailTex, uvR).r;
	float g = texture2D(TrailTex, uvG).g;
	float b = texture2D(TrailTex, uvB).b;
	vec4 layers = vec4(SGLinearToSRGB(ColorR.rgb) * r, r * ColorR.a);
	layers += vec4(g * SGLinearToSRGB(ColorG.rgb), g * ColorG.a);
	layers += vec4(b * SGLinearToSRGB(ColorB.rgb), b * ColorB.a);
	gl_FragColor = rwLitPBR(layers.rgb, 0.0, vec3(0.0), 0.5, 1.0, layers.rgb, sat(layers.a * vColor.a));
}`,
};

REG['Shader Graphs_Trail_CosmicRift_Transparent'] = {
	state: ST('alpha'),
	frag: /* glsl */ `
void main() {
	vec3 edgeColor = SGLinearToSRGB(_Edge_Color.rgb);
	vec3 mainColor = SGLinearToSRGB(_Color_Main.rgb);
	vec3 noise = texture2D(_Texture_Noise, rwPositionWS().xy * _Noise_Tiling.xy).rgb;
	vec3 mask = texture2D(_Texture_Mask, vUv0).rgb;
	vec3 maskedNoise = noise * mask.x;
	vec3 shadow = rwSmoothstep(_SmoothStep, _Edge_Shadow, maskedNoise);
	vec3 color = mainColor * shadow;
	color = edgeColor * mask.z + color;
	color = edgeColor * step(_Edge, maskedNoise) + color;
	float alpha = shadow.x * step(_Edge, maskedNoise.x + mask.y);
	gl_FragColor = vec4(color, alpha);
}`,
};

REG['Shader Graphs_Trail_CosmicRift_Cracks_Transparent'] = {
	state: ST('alpha'),
	frag: /* glsl */ `
void main() {
	vec2 mask = texture2D(_Texture_Mask, vUv0).xy;
	float inner = rwSmoothstep(mask.x, _InnerMask, _InnerMask_Smoothness);
	float cracks = texture2D(_Texture, rwPositionWS().xy * _Tiling.xy + _Mask_Offset.xy).r;
	float crackStep = step(mask.y, cracks);
	float alpha = vColor.a * _Color.a * crackStep * inner;
	vec3 color = SGLinearToSRGB(_Color.rgb) * vColor.rgb;
	gl_FragColor = vec4(color, alpha);
}`,
};

// Screen-space distortion: needs the opaque scene color (URP _CameraOpaqueTexture). Without
// ctx.shared.uCameraOpaqueTexture the effect renders nothing (alpha 0).
const OPAQUE_TEX = /* glsl */ `
#ifdef RW_HAS_OPAQUE_TEXTURE
uniform sampler2D uCameraOpaqueTexture;
vec3 rwSceneColor(vec2 uv) { return texture2D(uCameraOpaqueTexture, uv).rgb; }
#endif
`;

REG['Shader Graphs_Trail_DistortionWorldSpace'] = {
	state: ST('alpha', 'back', false, 'always'), opaqueTexture: true,
	frag: OPAQUE_TEX + /* glsl */ `
void main() {
#ifdef RW_HAS_OPAQUE_TEXTURE
	vec2 screenUV = rwScreenUV();
	vec2 distortUV = rwPositionWS().xy * _Tiling.xy + RW_TIME * _Distort_Speed.xy;
	vec2 distortion = texture2D(Texture2D_0ac0bf9879d047d0b057aaa087428274, distortUV).xy * 2.0 - 1.0;
	vec3 sceneColor = rwSceneColor(_Distort_Amount * distortion + screenUV);
	float mask = texture2D(_Mask_Texture, vUv0).r;
	gl_FragColor = vec4(sceneColor, mask);
#else
	gl_FragColor = vec4(0.0);
#endif
}`,
};

// ---- Particles --------------------------------------------------------------------------------------------------
// Custom vertex streams: uv (uv0.xy), uv1 = TEXCOORD1 (x = dissolve threshold, y = in/out or offset, z = rotation)

const DISSOLVE_HARD = /* glsl */ `
void main() {
	float mask = texture2D(_DissolveMask, vUv0).r;
#ifdef RW_DISSOLVE_INOUT
	mask = vUv1.y * (mask * -2.0 + 1.0) + mask;
#endif
	float tex = texture2D(_Texture, vUv0).r;
	float alpha = tex * mask;
	if (alpha - vUv1.x < 0.0) discard;
#ifdef RW_COLOR_SRGB
	vec3 color = SGLinearToSRGB(_Color.rgb) * vColor.rgb;
#else
	vec3 color = vColor.rgb * _Color.rgb;
#endif
	gl_FragColor = vec4(color, alpha);
}`;

REG['Shader Graphs_Particle_Dissolve_Hard_Additive'] = { state: ST('add', 'off'), frag: DISSOLVE_HARD };
REG['Shader Graphs_Particle_Dissolve_Hard_Emission'] = { state: ST('opaque', 'off'), defines: { RW_COLOR_SRGB: '' }, frag: DISSOLVE_HARD };
REG['Shader Graphs_Particle_Dissolve_Hard_InOut_Additive'] = { state: ST('add', 'off'), defines: { RW_DISSOLVE_INOUT: '', RW_COLOR_SRGB: '' }, frag: DISSOLVE_HARD };
REG['Shader Graphs_Particle_Dissolve_Hard_InOut_Emission'] = { state: ST('opaque', 'off'), defines: { RW_DISSOLVE_INOUT: '', RW_COLOR_SRGB: '' }, frag: DISSOLVE_HARD };

const SOFT_DISSOLVE = /* glsl */ `
float rwSoftDissolve(vec2 textureUV, vec2 maskUV, float threshold) {
	float mask = texture2D(_DissolveMask, maskUV).r;
	float tex = texture2D(_Texture, textureUV).r;
	return rwSmoothstep(threshold, 1.0, mask * tex);
}
`;

REG['Shader Graphs_Particle_Dissolve_Soft_Additive'] = {
	state: ST('add', 'off'),
	frag: SOFT_DISSOLVE + /* glsl */ `
void main() {
	float alpha = rwSoftDissolve(vUv0, vUv0, vUv1.x) * vColor.a;
	gl_FragColor = vec4(vColor.rgb * _Color.rgb, alpha);
}`,
};

REG['Shader Graphs_Particle_Dissolve_Soft_Emission'] = {
	state: ST('alpha', 'off'),
	frag: SOFT_DISSOLVE + /* glsl */ `
void main() {
	float alpha = rwSoftDissolve(vUv0, vUv0, vUv1.x) * vColor.a;
	gl_FragColor = vec4(SGLinearToSRGB(_Color.rgb) * vColor.rgb, alpha);
}`,
};

REG['Shader Graphs_Particle_Dissolve_Scrolling_Soft_Additive'] = {
	state: ST('add', 'off'),
	frag: SOFT_DISSOLVE + /* glsl */ `
void main() {
	vec2 maskUV = vUv0 * _DissolveMask_Tiling.xy + vUv1.yz;
	float alpha = rwSoftDissolve(vUv0, maskUV, vUv1.x) * vColor.a;
	gl_FragColor = vec4(SGLinearToSRGB(_Color.rgb) * vColor.rgb, alpha);
}`,
};

REG['Shader Graphs_Particle_Dissolve_Soft_AB_Fog'] = {
	state: ST('add'),
	frag: SOFT_DISSOLVE + /* glsl */ `
void main() {
	float alpha = rwSoftDissolve(vUv0, vUv0, vUv1.x) * vColor.a;
	float fog = rwSmoothstep(0.0, Vector1_be654cb9721b41de8eb3a47e320de7f4_1, Vector1_be654cb9721b41de8eb3a47e320de7f4 - rwPositionWS().z);
	vec3 color = mix(Color_d2fcc885299542a089ca4f39fe45a651.rgb, _Color.rgb * vColor.rgb, fog);
	gl_FragColor = vec4(color, alpha);
}`,
};

REG['Shader Graphs_Particle_Emission'] = {
	lit: true, state: ST('add', 'off'),
	frag: /* glsl */ `
void main() {
	vec4 tex = texture2D(Texture2D_2741f467f1544891a45008e02bbceb2e, vUv0) * vColor;
	float alpha = tex.a * tex.a * Color_285372d95ddf4eeb85c3d02afe2ab943.a;
	vec3 emissive = SGLinearToSRGB(Color_285372d95ddf4eeb85c3d02afe2ab943.rgb) * tex.rgb;
	gl_FragColor = rwLitPBR(emissive, 0.0, vec3(0.0), 0.5, 1.0, emissive, alpha);
}`,
};

REG['Shader Graphs_Particle_ZTest_Additive'] = {
	state: ST('add', 'back', true, 'always'),
	frag: /* glsl */ `
void main() {
	vec4 tex = texture2D(Texture2D_2741f467f1544891a45008e02bbceb2e, vUv0) * vColor;
	vec3 color = SGLinearToSRGB(Color_285372d95ddf4eeb85c3d02afe2ab943.rgb) * tex.rgb;
	gl_FragColor = vec4(color, tex.a * Color_285372d95ddf4eeb85c3d02afe2ab943.a);
}`,
};

REG['Shader Graphs_Particle_Scrolling_Masked'] = {
	state: ST('add', 'off'),
	frag: /* glsl */ `
void main() {
	vec2 uv = vUv0;
	vec3 color1 = SGLinearToSRGB(Color_c05728de45304bd38c31a09d4b91c6f3_1.rgb);
	vec3 color2 = SGLinearToSRGB(Color_4a591be828144a7f9318522928b6c44f.rgb);
	vec3 color = mix(color2, color1, vUv0.x) * vColor.rgb;
	vec2 maskUV = uv * Vector2_a62120b08bb74720860b21e30b58b908_1.xy + RW_TIME * Vector2_cf3b16e33cfb44d09a5a545ddf076c6f_1.xy;
	float mask = 1.0 - texture2D(Texture2D_1, maskUV).r;
	vec2 texUV = uv * Vector2_a62120b08bb74720860b21e30b58b908.xy + RW_TIME * Vector2_cf3b16e33cfb44d09a5a545ddf076c6f.xy;
	float tex = texture2D(Texture2D_161cc36a2247464a82d988c5fe7f7650, texUV).r;
	gl_FragColor = vec4(color, mask * tex * vColor.a);
}`,
};

REG['Shader Graphs_Particle_ChromaticOffsetAdditive'] = {
	state: ST('add', 'off'),
	frag: /* glsl */ `
#define ChromaTex Texture2D_161cc36a2247464a82d988c5fe7f7650
void main() {
	vec2 uv = vUv0;
	vec2 tiling = Vector2_a62120b08bb74720860b21e30b58b908.xy;
	vec2 scroll = _ScrollSpeed.xy * RW_TIME;
	float rotation = vUv1.z;
	vec2 offset = vUv1.xy;
	float red = texture2D(ChromaTex, uv * tiling + scroll).r;
	float green = texture2D(ChromaTex, rwRotateDeg(uv, vec2(0.5), rotation) * tiling + (scroll - offset)).g;
	float blue = texture2D(ChromaTex, rwRotateDeg(uv, vec2(0.5), 1.0 - rotation) * tiling + (scroll + offset)).g;
	vec3 color = SGLinearToSRGB(_Color.rgb) * vColor.rgb * vec3(red, green, blue);
	float mask = texture2D(_Mask, uv).r;
	gl_FragColor = vec4(color, mask * vColor.a);
}`,
};

REG['Shader Graphs_ChromaticOffsetAdditive'] = {
	state: ST('add'),
	frag: /* glsl */ `
#define ChromaTex Texture2D_161cc36a2247464a82d988c5fe7f7650
void main() {
	vec2 uv = vUv0;
	vec2 tiling = Vector2_a62120b08bb74720860b21e30b58b908.xy;
	float red = texture2D(ChromaTex, uv * tiling).r;
	float green = texture2D(ChromaTex, rwRotateDeg(uv, vec2(0.5), _Chromatic_Offset_Rotation) * tiling + _Chromatic_Offset.xy).g;
	float blue = texture2D(ChromaTex, rwRotateDeg(uv, vec2(0.5), 1.0 - _Chromatic_Offset_Rotation) * tiling - _Chromatic_Offset.xy).b;
	vec3 color = SGLinearToSRGB(_Color.rgb) * vColor.rgb * vec3(red, green, blue);
	gl_FragColor = vec4(color, vColor.a);
}`,
};

REG['Shader Graphs_Particle_Distortion'] = {
	state: ST('alpha', 'off', false, 'always'), opaqueTexture: true,
	frag: OPAQUE_TEX + /* glsl */ `
void main() {
#ifdef RW_HAS_OPAQUE_TEXTURE
	vec2 screenUV = rwScreenUV();
	vec2 distortion = texture2D(Texture2D_0ac0bf9879d047d0b057aaa087428274, vUv0).rg * 2.0 - 1.0;
	gl_FragColor = vec4(rwSceneColor(vUv1.x * distortion + screenUV), vColor.a);
#else
	gl_FragColor = vec4(0.0);
#endif
}`,
};

REG['Shader Graphs_Particle_Distortion_WorldspaceMasked'] = {
	state: ST('alpha', 'back', false, 'always'), opaqueTexture: true,
	frag: OPAQUE_TEX + /* glsl */ `
void main() {
#ifdef RW_HAS_OPAQUE_TEXTURE
	vec2 screenUV = rwScreenUV();
	vec2 normalUV = rwPositionWS().xy * _Normal_Tiling.xy + RW_TIME * _Normal_Scrollspeed.xy;
	vec2 distortion = texture2D(Texture2D_0ac0bf9879d047d0b057aaa087428274, normalUV).rg * 2.0 - 1.0;
	float mask = texture2D(_Texture_Mask, vUv0).r;
	gl_FragColor = vec4(rwSceneColor(vUv1.x * distortion + screenUV), mask);
#else
	gl_FragColor = vec4(0.0);
#endif
}`,
};

for (const name in REG) {
	const t = SG[name];
	if (!t) throw new Error('unityShaders: missing property table for ' + name);
	REG[name].props = t.props;
	REG[name].queue = t.queue;
}

// ---------------------------------------------------------------------------------------------------------------
// Built-in (URP / legacy) shaders

const URP_LIT_PROPS = [
	['_BaseMap', 't', 'white'], ['_BaseColor', 'v', [1, 1, 1, 1]], ['_Cutoff', 'f', 0.5],
	['_Smoothness', 'f', 0.5], ['_Metallic', 'f', 0], ['_MetallicGlossMap', 't', 'white'],
	['_SpecColor', 'v', [0.2, 0.2, 0.2, 1]], ['_SpecGlossMap', 't', 'white'],
	['_BumpMap', 't', 'bump'], ['_BumpScale', 'f', 1],
	['_OcclusionMap', 't', 'white'], ['_OcclusionStrength', 'f', 1],
	['_EmissionMap', 't', 'white'], ['_EmissionColor', 'v', [0, 0, 0, 1]],
	['_Surface', 'f', 0], ['_Blend', 'f', 0], ['_Cull', 'f', 2], ['_SrcBlend', 'f', 1], ['_DstBlend', 'f', 0],
	['_ZWrite', 'f', 1], ['_AlphaClip', 'f', 0],
];
const URP_BASE_UV = 'vec2 uv = vUv0 * _BaseMap_ST.xy + _BaseMap_ST.zw;';

// URP 12 Lit (metallic or specular workflow). Normal maps are not applied (vertex normal).
const URP_LIT_FRAG = /* glsl */ `
void main() {
	${URP_BASE_UV}
	vec4 albedoAlpha = texture2D(_BaseMap, uv);
	float alpha = albedoAlpha.a * _BaseColor.a;
#ifdef _ALPHATEST_ON
	if (alpha - _Cutoff < 0.0) discard;
#endif
	vec3 albedo = albedoAlpha.rgb * _BaseColor.rgb;
	vec4 specGloss;
#ifdef _METALLICSPECGLOSSMAP
	#ifdef _SPECULAR_SETUP
		specGloss = texture2D(_SpecGlossMap, uv);
	#else
		specGloss = texture2D(_MetallicGlossMap, uv);
	#endif
	#ifdef _SMOOTHNESS_TEXTURE_ALBEDO_CHANNEL_A
		specGloss.a = albedoAlpha.a * _Smoothness;
	#else
		specGloss.a *= _Smoothness;
	#endif
#else
	#ifdef _SPECULAR_SETUP
		specGloss.rgb = _SpecColor.rgb;
	#else
		specGloss.rgb = vec3(_Metallic);
	#endif
	#ifdef _SMOOTHNESS_TEXTURE_ALBEDO_CHANNEL_A
		specGloss.a = albedoAlpha.a * _Smoothness;
	#else
		specGloss.a = _Smoothness;
	#endif
#endif
	float occlusion = 1.0;
#ifdef _OCCLUSIONMAP
	occlusion = mix(1.0, texture2D(_OcclusionMap, uv).g, _OcclusionStrength);
#endif
	vec3 emission = vec3(0.0);
#ifdef _EMISSION
	emission = texture2D(_EmissionMap, uv).rgb * _EmissionColor.rgb;
#endif
	vec4 c = rwLitPBR(albedo, specGloss.r, specGloss.rgb, specGloss.a, occlusion, emission, alpha);
	c.a = (_Surface > 0.5) ? c.a : 1.0; // OutputAlpha
	gl_FragColor = c;
}`;

const URP_SIMPLELIT_PROPS = [
	['_BaseMap', 't', 'white'], ['_BaseColor', 'v', [1, 1, 1, 1]], ['_Cutoff', 'f', 0.5],
	['_SpecColor', 'v', [0.5, 0.5, 0.5, 0.5]], ['_SpecGlossMap', 't', 'white'], ['_Smoothness', 'f', 0.5],
	['_BumpMap', 't', 'bump'], ['_EmissionMap', 't', 'white'], ['_EmissionColor', 'v', [0, 0, 0, 1]],
	['_Surface', 'f', 0], ['_Blend', 'f', 0], ['_Cull', 'f', 2], ['_SrcBlend', 'f', 1], ['_DstBlend', 'f', 0],
	['_ZWrite', 'f', 1], ['_AlphaClip', 'f', 0],
];
// URP 12 Simple Lit (Blinn-Phong)
const URP_SIMPLELIT_FRAG = /* glsl */ `
void main() {
	${URP_BASE_UV}
	vec4 albedoAlpha = texture2D(_BaseMap, uv);
	float alpha = albedoAlpha.a * _BaseColor.a;
#ifdef _ALPHATEST_ON
	if (alpha - _Cutoff < 0.0) discard;
#endif
	vec3 albedo = albedoAlpha.rgb * _BaseColor.rgb;
#ifdef _ALPHAPREMULTIPLY_ON
	albedo *= alpha;
#endif
	vec4 specularSmoothness = vec4(0.0, 0.0, 0.0, 1.0);
#if defined(_SPECGLOSSMAP)
	specularSmoothness = texture2D(_SpecGlossMap, uv) * _SpecColor;
#elif defined(_SPECULAR_COLOR)
	specularSmoothness = _SpecColor;
#endif
#ifdef _GLOSSINESS_FROM_BASE_ALPHA
	specularSmoothness.a = alpha;
#endif
	vec3 emission = vec3(0.0);
#ifdef _EMISSION
	emission = texture2D(_EmissionMap, uv).rgb * _EmissionColor.rgb;
#endif
	vec4 c = rwLitBlinnPhong(albedo, specularSmoothness.rgb, specularSmoothness.a, emission, alpha);
	c.a = (_Surface > 0.5) ? c.a : 1.0;
	gl_FragColor = c;
}`;

const URP_UNLIT_PROPS = [
	['_BaseMap', 't', 'white'], ['_BaseColor', 'v', [1, 1, 1, 1]], ['_Cutoff', 'f', 0.5],
	['_Surface', 'f', 0], ['_Blend', 'f', 0], ['_Cull', 'f', 2], ['_SrcBlend', 'f', 1], ['_DstBlend', 'f', 0],
	['_ZWrite', 'f', 1], ['_AlphaClip', 'f', 0],
];
const URP_UNLIT_FRAG = /* glsl */ `
void main() {
	${URP_BASE_UV}
	vec4 tex = texture2D(_BaseMap, uv);
	vec3 color = tex.rgb * _BaseColor.rgb;
	float alpha = tex.a * _BaseColor.a;
#ifdef _ALPHATEST_ON
	if (alpha - _Cutoff < 0.0) discard;
#endif
#if defined(_ALPHAMODULATE_ON)
	color = mix(vec3(1.0), color, alpha);
#elif defined(_ALPHAPREMULTIPLY_ON)
	color *= alpha;
#endif
	gl_FragColor = vec4(color, (_Surface > 0.5) ? alpha : 1.0);
}`;

const URP_PARTICLES_PROPS = [
	['_BaseMap', 't', 'white'], ['_BaseColor', 'v', [1, 1, 1, 1]], ['_Cutoff', 'f', 0.5],
	['_EmissionMap', 't', 'white'], ['_EmissionColor', 'v', [0, 0, 0, 1]],
	['_BaseColorAddSubDiff', 'v', [0, 0, 0, 0]],
	['_Surface', 'f', 0], ['_Blend', 'f', 0], ['_Cull', 'f', 2], ['_SrcBlend', 'f', 1], ['_DstBlend', 'f', 0],
	['_ZWrite', 'f', 1], ['_AlphaClip', 'f', 0],
];
// URP 12 Particles Unlit (no flipbook blending / soft particles / camera fading)
const URP_PARTICLES_FRAG = /* glsl */ `
void main() {
	${URP_BASE_UV}
	vec4 albedo = texture2D(_BaseMap, uv) * _BaseColor;
#if defined(_COLOROVERLAY_ON)
	vec3 ov = mix(1.0 - 2.0 * (1.0 - albedo.rgb) * (1.0 - vColor.rgb), 2.0 * albedo.rgb * vColor.rgb, step(albedo.rgb, vec3(0.5)));
	albedo = vec4(ov, albedo.a * vColor.a);
#elif defined(_COLORADDSUBDIFF_ON)
	vec3 asd = albedo.rgb + vColor.rgb * _BaseColorAddSubDiff.x;
	asd = mix(asd, abs(asd), _BaseColorAddSubDiff.y);
	albedo = vec4(asd, albedo.a * vColor.a);
#else
	albedo *= vColor;
#endif
	float alpha = albedo.a;
#ifdef _ALPHATEST_ON
	if (alpha - _Cutoff < 0.0) discard;
#endif
	vec3 diffuse = albedo.rgb;
#if defined(_ALPHAMODULATE_ON)
	diffuse = mix(vec3(1.0), diffuse, alpha);
#elif defined(_ALPHAPREMULTIPLY_ON)
	diffuse *= alpha;
#endif
	vec3 emission = vec3(0.0);
#ifdef _EMISSION
	emission = texture2D(_EmissionMap, uv).rgb * _EmissionColor.rgb;
#endif
	gl_FragColor = vec4(diffuse + emission, (_Surface > 0.5) ? alpha : 1.0);
}`;

const LEGACY_MAINTEX_UV = 'vec2 uv = vUv0 * _MainTex_ST.xy + _MainTex_ST.zw;';

// Legacy Shaders/Particles/Additive: 2 * color * _TintColor * tex
const LEGACY_PARTICLE_ADD_FRAG = /* glsl */ `
void main() {
	${LEGACY_MAINTEX_UV}
	vec4 col = 2.0 * vColor * _TintColor * texture2D(_MainTex, uv);
	col.a = sat(col.a);
	gl_FragColor = col;
}`;
// Mobile/Particles/*: texture * vertex color
const MOBILE_PARTICLE_FRAG = /* glsl */ `
void main() {
	${LEGACY_MAINTEX_UV}
	vec4 col = texture2D(_MainTex, uv) * vColor;
#ifdef RW_MULTIPLY
	col.rgb = mix(vec3(1.0), col.rgb, col.a);
#endif
	gl_FragColor = col;
}`;
// Sprites/Default (premultiplied output)
const SPRITE_FRAG = /* glsl */ `
void main() {
	vec4 c = texture2D(_MainTex, vUv0) * (vColor * _Color * _RendererColor);
	c.rgb *= c.a;
	gl_FragColor = c;
}`;
// Legacy Diffuse-like (Lambert, ambient = 1): albedo * (ambient + light)
const LEGACY_DIFFUSE_FRAG = /* glsl */ `
void main() {
	${LEGACY_MAINTEX_UV}
	vec4 tex = texture2D(_MainTex, uv) * _Color;
	vec3 N = rwNormalWS();
	vec3 L = uMainLightDir * inversesqrt(max(dot(uMainLightDir, uMainLightDir), 1e-20));
	vec3 light = vec3(1.0) + uMainLightColor * sat(dot(N, L));
	gl_FragColor = vec4(tex.rgb * light, 1.0);
}`;

function urpState(m) {
	const f = m.floats || {};
	const surface = f._Surface ?? 0;
	return {
		blend: unityBlend(f._SrcBlend ?? (surface ? 5 : 1), f._DstBlend ?? (surface ? 10 : 0)),
		cull: unityCull(f._Cull ?? 2),
		zwrite: (f._ZWrite ?? (surface ? 0 : 1)) >= 0.5,
		ztest: 'lequal',
	};
}

const BUILTIN = {
	'urp-lit': { lit: true, props: URP_LIT_PROPS, frag: URP_LIT_FRAG, queue: 2000, state: urpState, keywords: true },
	'urp-simplelit': { lit: true, props: URP_SIMPLELIT_PROPS, frag: URP_SIMPLELIT_FRAG, queue: 2000, state: urpState, keywords: true },
	'urp-unlit': { props: URP_UNLIT_PROPS, frag: URP_UNLIT_FRAG, queue: 2000, state: urpState, keywords: true },
	'urp-particles-unlit': { props: URP_PARTICLES_PROPS, frag: URP_PARTICLES_FRAG, queue: 3000, state: urpState, keywords: true },
	'legacy-particles-additive': {
		props: [['_TintColor', 'v', [0.5, 0.5, 0.5, 0.5]], ['_MainTex', 't', 'white'], ['_InvFade', 'f', 1]],
		frag: LEGACY_PARTICLE_ADD_FRAG, queue: 3000, state: ST('addLegacy', 'off', false),
	},
	'mobile-particles-additive': {
		props: [['_MainTex', 't', 'white']], frag: MOBILE_PARTICLE_FRAG, queue: 3000, state: ST('addLegacy', 'off', false),
	},
	'mobile-particles-alpha': {
		props: [['_MainTex', 't', 'white']], frag: MOBILE_PARTICLE_FRAG, queue: 3000, state: ST('alphaLegacy', 'off', false),
	},
	'mobile-particles-multiply': {
		props: [['_MainTex', 't', 'white']], frag: MOBILE_PARTICLE_FRAG, queue: 3000, state: ST('mul', 'off', false),
		defines: { RW_MULTIPLY: '' },
	},
	'sprites-default': {
		props: [['_MainTex', 't', 'white'], ['_Color', 'v', [1, 1, 1, 1]], ['_RendererColor', 'v', [1, 1, 1, 1]], ['_Flip', 'v', [1, 1, 1, 1]]],
		frag: SPRITE_FRAG, queue: 3000, state: ST('premul', 'off', false), defines: { RW_SPRITE: '' }, vertexPropsOnly: ['_Flip'],
	},
	'legacy-diffuse': {
		lit: true, props: [['_MainTex', 't', 'white'], ['_Color', 'v', [1, 1, 1, 1]]],
		frag: LEGACY_DIFFUSE_FRAG, queue: 2000, state: ST('opaque'),
	},
};

const URP_GUIDS = {
	'933532a4fcc9baf4fa0491de14d08ed7': 'urp-lit',
	'8d2bb70cbf9db8d4da26e15b26e74248': 'urp-simplelit',
	'650dd9526735d5b46b79224bc6e94025': 'urp-unlit',
	'0406db5a14f94604a8c57ccfbc9f3b46': 'urp-particles-unlit',
	'b7839dad95683814aa64166edc107ae2': 'urp-particles-unlit', // Particles/Lit (approximated as unlit)
	'8516d7a69675844a7a0b7095af7c46af': 'urp-particles-unlit', // Particles/Simple Lit (approximated as unlit)
};
const BUILTIN_RESOURCES_GUID = '0000000000000000f000000000000000';
// Fallback for older exports without the guid (from the Unity project's .mat files)
const MATERIAL_NAME_HINTS = {
	MT_Midground: 'urp-simplelit', MT_Gravityfield_Switch: 'urp-simplelit',
	MT_W2_Glow: 'urp-unlit', MT_W3_Glow: 'urp-unlit', ParticlesUnlit: 'urp-particles-unlit',
};

function resolveBuiltin(shader, m) {
	const parts = shader.split(':');
	const fileID = parts[1] || '';
	const guid = (parts[2] || '').toLowerCase();
	if (fileID === '4800000' || (guid && guid !== BUILTIN_RESOURCES_GUID && URP_GUIDS[guid])) {
		if (URP_GUIDS[guid]) return URP_GUIDS[guid];
		if (MATERIAL_NAME_HINTS[m.name]) return MATERIAL_NAME_HINTS[m.name];
		const f = m.floats || {};
		if ('_ColorMode' in f || '_FlipbookMode' in f || '_SoftParticlesEnabled' in f) return 'urp-particles-unlit';
		return 'urp-lit';
	}
	const c = m.colors || {};
	switch (fileID) {
		case '10720': return 'mobile-particles-additive';
		case '10721': return 'mobile-particles-alpha';
		case '10722': return 'mobile-particles-multiply';
		case '10753': return 'sprites-default';
		case '10770': case '10782': return null; // UI/Default, UI shaders
		case '200':
			// Materials in this project with fileID 200 carry _TintColor/_InvFade (Legacy Particles/Additive);
			// anything else is treated as Legacy Diffuse.
			return ('_TintColor' in c || '_InvFade' in (m.floats || {})) ? 'legacy-particles-additive' : 'legacy-diffuse';
		default:
			if ('_TintColor' in c) return 'legacy-particles-additive';
			if ('_RendererColor' in c) return 'sprites-default';
			return 'legacy-diffuse';
	}
}

export const SUPPORTED_SHADERS = [
	...Object.keys(REG),
	...Object.keys(BUILTIN).map((k) => 'builtin:' + k),
];

// ---------------------------------------------------------------------------------------------------------------
// Default textures

const _defTex = {};
function makeTex(kind, rgba) {
	const t = new THREE.DataTexture(new Uint8Array(rgba), 1, 1, THREE.RGBAFormat);
	t.colorSpace = THREE.NoColorSpace;
	t.name = 'unity_default_' + kind;
	t.needsUpdate = true;
	return t;
}
function defaultTexture(kind, ctx) {
	if ((kind === 'white' || !kind) && ctx && ctx.white) return ctx.white;
	switch (kind) {
		case 'black': return _defTex.black || (_defTex.black = makeTex('black', [0, 0, 0, 0]));
		case 'gray': case 'grey': return _defTex.gray || (_defTex.gray = makeTex('gray', [128, 128, 128, 128]));
		case 'bump': return _defTex.bump || (_defTex.bump = makeTex('bump', [128, 128, 255, 255]));
		case 'red': return _defTex.red || (_defTex.red = makeTex('red', [255, 0, 0, 255]));
		default: return _defTex.white || (_defTex.white = makeTex('white', [255, 255, 255, 255]));
	}
}

// ---------------------------------------------------------------------------------------------------------------
// Material construction

function uniformDecls(props, skip) {
	let s = '';
	for (const [name, type] of props) {
		if (skip && skip.includes(name)) continue;
		if (type === 'f') s += `uniform float ${name};\n`;
		else if (type === 'v') s += `uniform vec4 ${name};\n`;
		else if (type === 't') s += `uniform sampler2D ${name};\nuniform vec4 ${name}_ST;\n`;
	}
	return s;
}

function num(v, d) { return typeof v === 'number' && isFinite(v) ? v : d; }

function buildUniforms(props, m, ctx) {
	const floats = m.floats || {}, colors = m.colors || {}, textures = m.textures || {};
	const u = {};
	for (const [name, type, dflt] of props) {
		if (type === 'f') {
			u[name] = { value: num(floats[name], dflt) };
		} else if (type === 'v') {
			const c = Array.isArray(colors[name]) ? colors[name] : dflt;
			u[name] = { value: new THREE.Vector4(num(c[0], dflt[0]), num(c[1], dflt[1]), num(c[2], dflt[2]), num(c[3], dflt[3] ?? 1)) };
		} else if (type === 't') {
			const tj = textures[name];
			let tex = null;
			if (tj && tj.tex && ctx.getTexture) tex = ctx.getTexture(tj.tex) || null;
			u[name] = { value: tex || defaultTexture(dflt, ctx) };
			const sc = (tj && tj.scale) || [1, 1], of = (tj && tj.offset) || [0, 0];
			u[name + '_ST'] = { value: new THREE.Vector4(num(sc[0], 1), num(sc[1], 1), num(of[0], 0), num(of[1], 0)) };
		}
	}
	return u;
}

function applyState(mat, st) {
	mat.side = st.cull === 'off' ? THREE.DoubleSide : st.cull === 'front' ? THREE.BackSide : THREE.FrontSide;
	mat.forceSinglePass = true; // Unity draws Cull Off in a single pass
	mat.depthTest = true;
	mat.depthFunc = st.ztest === 'always' ? THREE.AlwaysDepth : THREE.LessEqualDepth;
	mat.depthWrite = !!st.zwrite;
	const b = typeof st.blend === 'string' ? BLEND[st.blend] : st.blend;
	mat.premultipliedAlpha = false;
	if (!b) {
		mat.blending = THREE.NoBlending;
	} else {
		mat.blending = THREE.CustomBlending;
		mat.blendEquation = THREE.AddEquation;
		mat.blendEquationAlpha = THREE.AddEquation;
		mat.blendSrc = b[0];
		mat.blendDst = b[1];
		mat.blendSrcAlpha = b[2];
		mat.blendDstAlpha = b[3];
	}
}

const _warned = new Set();

/**
 * Creates a THREE.ShaderMaterial for one materials.json entry.
 * @param {object} matJson { name, shader, queue, keywords, tags, floats, colors, textures }
 * @param {object} ctx { getTexture(id), shared: { uMainLightDir, uMainLightColor, uTime, uSinTime, [uEnvReflection],
 *                       [uCameraOpaqueTexture] }, hasVertexColor, skinned, white }
 * @returns {THREE.ShaderMaterial|null} null for UI / TextMeshPro / unknown shaders
 */
export function createUnityMaterial(matJson, ctx = {}) {
	if (!matJson || typeof matJson.shader !== 'string') return null;
	const shader = matJson.shader;
	let def, kind;
	if (shader.startsWith('builtin:')) {
		kind = resolveBuiltin(shader, matJson);
		def = kind ? BUILTIN[kind] : null;
	} else {
		def = REG[shader];
		kind = shader;
	}
	if (!def) {
		if (!/^(TextMeshPro|UI_|TMP|Hidden)/.test(shader) && !_warned.has(shader)) {
			_warned.add(shader);
			console.warn('[unityShaders] unsupported shader:', shader, '(material ' + matJson.name + ')');
		}
		return null;
	}

	const shared = Object.assign({}, sharedUniforms, ctx.shared || {});
	const defines = Object.assign({}, def.defines || {});
	if (def.keywords) {
		for (const k of matJson.keywords || []) if (/^_[A-Z0-9_]+$/.test(k)) defines[k] = '';
	}
	if (ctx.hasVertexColor) defines.USE_VERTEX_COLOR = '';
	if (def.opaqueTexture && shared.uCameraOpaqueTexture) defines.RW_HAS_OPAQUE_TEXTURE = '';

	const uniforms = buildUniforms(def.props, matJson, ctx);
	uniforms.uTime = shared.uTime;
	uniforms.uSinTime = shared.uSinTime;
	if (def.lit) {
		uniforms.uMainLightDir = shared.uMainLightDir;
		uniforms.uMainLightColor = shared.uMainLightColor;
		uniforms.uEnvReflection = shared.uEnvReflection;
	}
	if (defines.RW_HAS_OPAQUE_TEXTURE) uniforms.uCameraOpaqueTexture = shared.uCameraOpaqueTexture;

	const fragmentShader = [FRAG_COMMON, def.lit ? LIT_CHUNK : '', uniformDecls(def.props, def.vertexPropsOnly), def.frag].join('\n');

	const mat = new THREE.ShaderMaterial({
		name: matJson.name || shader,
		uniforms,
		defines,
		vertexShader: VERTEX_SHADER,
		fragmentShader,
		lights: false,
		fog: false,
	});
	mat.toneMapped = false;

	let queue = typeof matJson.queue === 'number' && matJson.queue >= 0 ? matJson.queue : def.queue;
	const st = def.state(matJson);
	applyState(mat, st);
	// Unity: queue <= 2500 is drawn in the opaque pass, > 2500 in the (back-to-front sorted) transparent pass
	mat.transparent = queue > 2500;
	mat.userData.renderQueue = queue;
	mat.userData.alphaTest = queue >= 2450 && queue <= 2500;
	mat.userData.unityShader = shader;
	mat.userData.unityShaderKind = kind;
	mat.userData.unityName = matJson.name;
	return mat;
}

/**
 * MaterialPropertyBlock-style setter using Unity property names.
 * value: number | [r,g,b,a] | THREE.Color | THREE.Vector4 | THREE.Texture | null (texture -> default white)
 * Returns false when the material has no such property.
 */
export function setUnityProperty(material, name, value) {
	const u = material && material.uniforms && material.uniforms[name];
	if (!u) return false;
	const cur = u.value;
	if (cur && cur.isVector4) {
		if (Array.isArray(value)) cur.set(value[0] ?? 0, value[1] ?? 0, value[2] ?? 0, value[3] ?? 1);
		else if (value && value.isColor) cur.set(value.r, value.g, value.b, cur.w);
		else if (value && (value.isVector4 || value.isVector3 || value.isVector2)) cur.set(value.x, value.y, value.z ?? cur.z, value.w ?? cur.w);
		else if (typeof value === 'number') cur.set(value, value, value, value);
		else return false;
	} else if (cur && cur.isTexture) {
		u.value = value && value.isTexture ? value : defaultTexture('white');
	} else {
		u.value = value;
	}
	return true;
}
