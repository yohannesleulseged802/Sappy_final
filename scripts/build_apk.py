#!/usr/bin/env python3
"""
Builds a universal, architecture-independent Android APK (sappy-stationary-pos.apk)
compatible with Android 5.0 (API 21) through Android 15 (API 35) across all CPU
architectures (arm64-v8a, armeabi-v7a, x86, x86_64).

Includes:
- Binary AndroidManifest.xml (AXML format with sorted attribute resource IDs)
- Valid classes.dex (Dalvik bytecode launching fullscreen WebView POS terminal with full offline asset loading)
- Valid resources.arsc (4-byte aligned, uncompressed)
- Complete offline web application bundled directly into assets/ (file:///android_asset/index.html)
- Zero external server dependency — works 100% offline, never shows "Page not found"
- Both V1 (JAR / META-INF) and V2 (APK Signature Scheme v2) cryptographic signatures
"""

import base64
import hashlib
import math
import os
import struct
import subprocess
import tempfile
import zlib

APP_URL = "file:///android_asset/index.html"
PACKAGE_NAME = "com.sappystationary.pos"
APP_LABEL = "Sappy POS"
VERSION_CODE = 2
VERSION_NAME = "1.0.1"


# ============================================================================
# 1. BINARY ANDROIDMANIFEST.XML (AXML) GENERATOR
# ============================================================================
def build_axml() -> bytes:
    attr_defs = [
        ("theme", 0x01010000),
        ("label", 0x01010001),
        ("name", 0x01010003),
        ("exported", 0x01010010),
        ("configChanges", 0x0101001F),
        ("minSdkVersion", 0x0101020C),
        ("versionCode", 0x0101021B),
        ("versionName", 0x0101021C),
        ("targetSdkVersion", 0x01010270),
        ("hardwareAccelerated", 0x010102D3),
        ("usesCleartextTraffic", 0x010104EC),
    ]

    other_strings = [
        "android",
        "http://schemas.android.com/apk/res/android",
        "",
        "manifest",
        "package",
        PACKAGE_NAME,
        VERSION_NAME,
        "uses-sdk",
        "uses-permission",
        "android.permission.INTERNET",
        "android.permission.ACCESS_NETWORK_STATE",
        "android.permission.CAMERA",
        "application",
        "activity",
        f"{PACKAGE_NAME}.MainActivity",
        "intent-filter",
        "action",
        "android.intent.action.MAIN",
        "category",
        "android.intent.category.LAUNCHER",
        APP_LABEL,
    ]

    attr_names = [name for name, _ in attr_defs]
    pool_strings = attr_names + other_strings
    str_idx = {s: i for i, s in enumerate(pool_strings)}

    NS_PREFIX = str_idx["android"]
    NS_URI = str_idx["http://schemas.android.com/apk/res/android"]
    NO_NS = 0xFFFFFFFF

    # 1. String Pool Chunk
    sp_offsets = []
    sp_data = bytearray()
    for s in pool_strings:
        sp_offsets.append(len(sp_data))
        u16 = s.encode("utf-16le")
        sp_data += struct.pack("<H", len(s)) + u16 + b"\x00\x00"

    sp_header_size = 28
    sp_chunk_size = sp_header_size + len(sp_offsets) * 4 + len(sp_data)
    while sp_chunk_size % 4 != 0:
        sp_data.append(0)
        sp_chunk_size += 1

    strings_start = sp_header_size + len(sp_offsets) * 4
    sp_header = struct.pack(
        "<HHIIIIII",
        0x0001,  # RES_STRING_POOL_TYPE
        sp_header_size,
        sp_chunk_size,
        len(pool_strings),
        0,  # styleCount
        0,  # flags (UTF-16)
        strings_start,
        0,  # stylesStart
    )
    sp_chunk = sp_header + struct.pack(f"<{len(sp_offsets)}I", *sp_offsets) + bytes(sp_data)

    # 2. Resource Map Chunk
    res_ids = [res_id for _, res_id in attr_defs]
    rm_chunk_size = 8 + len(res_ids) * 4
    rm_chunk = struct.pack("<HHI", 0x0180, 8, rm_chunk_size) + struct.pack(
        f"<{len(res_ids)}I", *res_ids
    )

    # XML node generators
    def start_ns(line=1):
        return struct.pack("<HHIIIII", 0x0100, 16, 24, line, 0xFFFFFFFF, NS_PREFIX, NS_URI)

    def end_ns(line=1):
        return struct.pack("<HHIIIII", 0x0101, 16, 24, line, 0xFFFFFFFF, NS_PREFIX, NS_URI)

    def attr_string(ns_idx, name_s, val_s):
        return struct.pack(
            "<IIIHBBI",
            ns_idx,
            str_idx[name_s],
            str_idx[val_s],
            8,
            0,
            0x03,  # TYPE_STRING
            str_idx[val_s],
        )

    def attr_int(ns_idx, name_s, val_int):
        return struct.pack(
            "<IIIHBBI",
            ns_idx,
            str_idx[name_s],
            0xFFFFFFFF,
            8,
            0,
            0x10,  # TYPE_INT_DEC
            val_int,
        )

    def attr_bool(ns_idx, name_s, val_b):
        return struct.pack(
            "<IIIHBBI",
            ns_idx,
            str_idx[name_s],
            0xFFFFFFFF,
            8,
            0,
            0x12,  # TYPE_INT_BOOLEAN
            0xFFFFFFFF if val_b else 0,
        )

    def attr_ref(ns_idx, name_s, res_ref):
        return struct.pack(
            "<IIIHBBI",
            ns_idx,
            str_idx[name_s],
            0xFFFFFFFF,
            8,
            0,
            0x01,  # TYPE_REFERENCE
            res_ref,
        )

    def start_element(name_s, attrs, line=1):
        chunk_size = 36 + len(attrs) * 20
        return (
            struct.pack(
                "<HHIIIIIHHHHHH",
                0x0102,  # RES_XML_START_ELEMENT_TYPE
                16,
                chunk_size,
                line,
                0xFFFFFFFF,
                NO_NS,
                str_idx[name_s],
                0x0014,  # attributeStart
                0x0014,  # attributeSize
                len(attrs),
                0,
                0,
                0,
            )
            + b"".join(attrs)
        )

    def end_element(name_s, line=1):
        return struct.pack(
            "<HHIIIII",
            0x0103,  # RES_XML_END_ELEMENT_TYPE
            16,
            24,
            line,
            0xFFFFFFFF,
            NO_NS,
            str_idx[name_s],
        )

    xml_nodes = []
    xml_nodes.append(start_ns(1))

    # <manifest android:versionCode="2" android:versionName="1.0.1" package="com.sappystationary.pos">
    xml_nodes.append(
        start_element(
            "manifest",
            [
                attr_int(NS_URI, "versionCode", VERSION_CODE),
                attr_string(NS_URI, "versionName", VERSION_NAME),
                attr_string(NO_NS, "package", PACKAGE_NAME),
            ],
            2,
        )
    )

    # <uses-sdk android:minSdkVersion="21" android:targetSdkVersion="33" />
    xml_nodes.append(
        start_element(
            "uses-sdk",
            [
                attr_int(NS_URI, "minSdkVersion", 21),
                attr_int(NS_URI, "targetSdkVersion", 33),
            ],
            3,
        )
    )
    xml_nodes.append(end_element("uses-sdk", 3))

    # Permissions for Offline + Camera Scanner + Network Sync
    for perm in [
        "android.permission.INTERNET",
        "android.permission.ACCESS_NETWORK_STATE",
        "android.permission.CAMERA",
    ]:
        xml_nodes.append(
            start_element("uses-permission", [attr_string(NS_URI, "name", perm)], 4)
        )
        xml_nodes.append(end_element("uses-permission", 4))

    # <application android:theme="@android:style/Theme.NoTitleBar" android:label="Sappy POS" android:hardwareAccelerated="true" android:usesCleartextTraffic="true">
    xml_nodes.append(
        start_element(
            "application",
            [
                attr_ref(NS_URI, "theme", 0x01030006),
                attr_string(NS_URI, "label", APP_LABEL),
                attr_bool(NS_URI, "hardwareAccelerated", True),
                attr_bool(NS_URI, "usesCleartextTraffic", True),
            ],
            5,
        )
    )

    # <activity android:label="Sappy POS" android:name="com.sappystationary.pos.MainActivity" android:exported="true" android:configChanges="0x04a0">
    xml_nodes.append(
        start_element(
            "activity",
            [
                attr_string(NS_URI, "label", APP_LABEL),
                attr_string(NS_URI, "name", f"{PACKAGE_NAME}.MainActivity"),
                attr_bool(NS_URI, "exported", True),
                attr_int(NS_URI, "configChanges", 0x04A0),
            ],
            6,
        )
    )

    # <intent-filter>
    xml_nodes.append(start_element("intent-filter", [], 7))
    xml_nodes.append(
        start_element("action", [attr_string(NS_URI, "name", "android.intent.action.MAIN")], 8)
    )
    xml_nodes.append(end_element("action", 8))
    xml_nodes.append(
        start_element(
            "category", [attr_string(NS_URI, "name", "android.intent.category.LAUNCHER")], 9
        )
    )
    xml_nodes.append(end_element("category", 9))
    xml_nodes.append(end_element("intent-filter", 7))

    xml_nodes.append(end_element("activity", 6))
    xml_nodes.append(end_element("application", 5))
    xml_nodes.append(end_element("manifest", 2))
    xml_nodes.append(end_ns(1))

    body = sp_chunk + rm_chunk + b"".join(xml_nodes)
    total_size = 8 + len(body)
    return struct.pack("<HHI", 0x0003, 8, total_size) + body


# ============================================================================
# 2. DALVIK EXECUTABLE (CLASSES.DEX) GENERATOR
# ============================================================================
def uleb128(val: int) -> bytes:
    out = bytearray()
    while True:
        b = val & 0x7F
        val >>= 7
        if val != 0:
            out.append(b | 0x80)
        else:
            out.append(b)
            break
    return bytes(out)


def build_dex() -> bytes:
    # Strings MUST be strictly sorted lexicographically by UTF-8 code points
    raw_strings = sorted(
        set(
            [
                "<init>",
                "I",
                "L",
                "Landroid/app/Activity;",
                "Landroid/content/Context;",
                "Landroid/os/Bundle;",
                "Landroid/view/View;",
                "Landroid/webkit/WebSettings;",
                "Landroid/webkit/WebView;",
                "Landroid/webkit/WebViewClient;",
                "Lcom/sappystationary/pos/MainActivity;",
                "Ljava/lang/Object;",
                "Ljava/lang/String;",
                "V",
                "VL",
                "VZ",
                "Z",
                "getSettings",
                APP_URL,
                "loadUrl",
                "onCreate",
                "setAllowContentAccess",
                "setAllowFileAccess",
                "setAllowFileAccessFromFileURLs",
                "setAllowUniversalAccessFromFileURLs",
                "setContentView",
                "setDatabaseEnabled",
                "setDomStorageEnabled",
                "setJavaScriptEnabled",
                "setWebViewClient",
            ]
        )
    )
    s_idx = {s: i for i, s in enumerate(raw_strings)}

    # Types MUST be sorted by their string_idx
    raw_types = sorted(
        [
            "I",
            "Landroid/app/Activity;",
            "Landroid/content/Context;",
            "Landroid/os/Bundle;",
            "Landroid/view/View;",
            "Landroid/webkit/WebSettings;",
            "Landroid/webkit/WebView;",
            "Landroid/webkit/WebViewClient;",
            "Lcom/sappystationary/pos/MainActivity;",
            "Ljava/lang/Object;",
            "Ljava/lang/String;",
            "V",
            "Z",
        ],
        key=lambda t: s_idx[t],
    )
    t_idx = {t: i for i, t in enumerate(raw_types)}

    # Protos: (shorty_str, return_type_str, [param_type_strs])
    raw_protos = [
        ("V", "V", []),
        ("L", "Landroid/webkit/WebSettings;", []),
        ("VL", "V", ["Landroid/content/Context;"]),
        ("VL", "V", ["Landroid/os/Bundle;"]),
        ("VL", "V", ["Landroid/view/View;"]),
        ("VL", "V", ["Landroid/webkit/WebViewClient;"]),
        ("VL", "V", ["Ljava/lang/String;"]),
        ("VZ", "V", ["Z"]),
    ]
    raw_protos.sort(key=lambda p: (t_idx[p[1]], [t_idx[x] for x in p[2]]))
    p_idx = {(p[1], tuple(p[2])): i for i, p in enumerate(raw_protos)}

    # Methods: (class_type, name_str, (ret_type, (param_types...)))
    raw_methods = [
        ("Landroid/app/Activity;", "<init>", ("V", ())),
        ("Landroid/app/Activity;", "onCreate", ("V", ("Landroid/os/Bundle;",))),
        ("Landroid/app/Activity;", "setContentView", ("V", ("Landroid/view/View;",))),
        ("Landroid/webkit/WebSettings;", "setAllowContentAccess", ("V", ("Z",))),
        ("Landroid/webkit/WebSettings;", "setAllowFileAccess", ("V", ("Z",))),
        ("Landroid/webkit/WebSettings;", "setAllowFileAccessFromFileURLs", ("V", ("Z",))),
        ("Landroid/webkit/WebSettings;", "setAllowUniversalAccessFromFileURLs", ("V", ("Z",))),
        ("Landroid/webkit/WebSettings;", "setDatabaseEnabled", ("V", ("Z",))),
        ("Landroid/webkit/WebSettings;", "setDomStorageEnabled", ("V", ("Z",))),
        ("Landroid/webkit/WebSettings;", "setJavaScriptEnabled", ("V", ("Z",))),
        ("Landroid/webkit/WebView;", "<init>", ("V", ("Landroid/content/Context;",))),
        ("Landroid/webkit/WebView;", "getSettings", ("Landroid/webkit/WebSettings;", ())),
        ("Landroid/webkit/WebView;", "loadUrl", ("V", ("Ljava/lang/String;",))),
        ("Landroid/webkit/WebView;", "setWebViewClient", ("V", ("Landroid/webkit/WebViewClient;",))),
        ("Landroid/webkit/WebViewClient;", "<init>", ("V", ())),
        ("Lcom/sappystationary/pos/MainActivity;", "<init>", ("V", ())),
        ("Lcom/sappystationary/pos/MainActivity;", "onCreate", ("V", ("Landroid/os/Bundle;",))),
    ]
    raw_methods.sort(key=lambda m: (t_idx[m[0]], s_idx[m[1]], p_idx[m[2]]))
    m_idx = {(m[0], m[1], m[2]): i for i, m in enumerate(raw_methods)}

    # Assemble MainActivity.<init>()V code_item
    m_act_init = m_idx[("Landroid/app/Activity;", "<init>", ("V", ()))]
    init_insns = struct.pack("<HHH", 0x1070, m_act_init, 0x0000) + struct.pack("<H", 0x000E)
    code_init = struct.pack("<HHHHII", 1, 1, 1, 0, 0, len(init_insns) // 2) + init_insns

    # Assemble MainActivity.onCreate(Bundle)V code_item
    m_super_oncreate = m_idx[("Landroid/app/Activity;", "onCreate", ("V", ("Landroid/os/Bundle;",)))]
    m_wv_init = m_idx[("Landroid/webkit/WebView;", "<init>", ("V", ("Landroid/content/Context;",)))]
    m_wv_settings = m_idx[("Landroid/webkit/WebView;", "getSettings", ("Landroid/webkit/WebSettings;", ()))]
    m_ws_js = m_idx[("Landroid/webkit/WebSettings;", "setJavaScriptEnabled", ("V", ("Z",)))]
    m_ws_dom = m_idx[("Landroid/webkit/WebSettings;", "setDomStorageEnabled", ("V", ("Z",)))]
    m_ws_db = m_idx[("Landroid/webkit/WebSettings;", "setDatabaseEnabled", ("V", ("Z",)))]
    m_ws_file = m_idx[("Landroid/webkit/WebSettings;", "setAllowFileAccess", ("V", ("Z",)))]
    m_ws_content = m_idx[("Landroid/webkit/WebSettings;", "setAllowContentAccess", ("V", ("Z",)))]
    m_ws_file_urls = m_idx[("Landroid/webkit/WebSettings;", "setAllowFileAccessFromFileURLs", ("V", ("Z",)))]
    m_ws_univ_urls = m_idx[("Landroid/webkit/WebSettings;", "setAllowUniversalAccessFromFileURLs", ("V", ("Z",)))]
    m_wvc_init = m_idx[("Landroid/webkit/WebViewClient;", "<init>", ("V", ()))]
    m_wv_client = m_idx[("Landroid/webkit/WebView;", "setWebViewClient", ("V", ("Landroid/webkit/WebViewClient;",)))]
    m_set_content = m_idx[("Landroid/app/Activity;", "setContentView", ("V", ("Landroid/view/View;",)))]
    m_wv_load = m_idx[("Landroid/webkit/WebView;", "loadUrl", ("V", ("Ljava/lang/String;",)))]

    t_webview = t_idx["Landroid/webkit/WebView;"]
    t_wvclient = t_idx["Landroid/webkit/WebViewClient;"]
    s_url = s_idx[APP_URL]

    oncreate_insns = b"".join(
        [
            # invoke-super {v3, v4}, Activity.onCreate(Bundle)
            struct.pack("<HHH", 0x206F, m_super_oncreate, 0x0043),
            # new-instance v0, WebView
            struct.pack("<HH", 0x0022, t_webview),
            # invoke-direct {v0, v3}, WebView.<init>(Context)
            struct.pack("<HHH", 0x2070, m_wv_init, 0x0030),
            # invoke-virtual {v0}, WebView.getSettings()
            struct.pack("<HHH", 0x106E, m_wv_settings, 0x0000),
            # move-result-object v1
            struct.pack("<H", 0x010C),
            # const/4 v2, 1
            struct.pack("<H", 0x1212),
            # invoke-virtual {v1, v2}, WebSettings.setJavaScriptEnabled(Z)
            struct.pack("<HHH", 0x206E, m_ws_js, 0x0021),
            # invoke-virtual {v1, v2}, WebSettings.setDomStorageEnabled(Z)
            struct.pack("<HHH", 0x206E, m_ws_dom, 0x0021),
            # invoke-virtual {v1, v2}, WebSettings.setDatabaseEnabled(Z)
            struct.pack("<HHH", 0x206E, m_ws_db, 0x0021),
            # invoke-virtual {v1, v2}, WebSettings.setAllowFileAccess(Z)
            struct.pack("<HHH", 0x206E, m_ws_file, 0x0021),
            # invoke-virtual {v1, v2}, WebSettings.setAllowContentAccess(Z)
            struct.pack("<HHH", 0x206E, m_ws_content, 0x0021),
            # invoke-virtual {v1, v2}, WebSettings.setAllowFileAccessFromFileURLs(Z)
            struct.pack("<HHH", 0x206E, m_ws_file_urls, 0x0021),
            # invoke-virtual {v1, v2}, WebSettings.setAllowUniversalAccessFromFileURLs(Z)
            struct.pack("<HHH", 0x206E, m_ws_univ_urls, 0x0021),
            # new-instance v1, WebViewClient
            struct.pack("<HH", 0x0122, t_wvclient),
            # invoke-direct {v1}, WebViewClient.<init>()
            struct.pack("<HHH", 0x1070, m_wvc_init, 0x0001),
            # invoke-virtual {v0, v1}, WebView.setWebViewClient(WebViewClient)
            struct.pack("<HHH", 0x206E, m_wv_client, 0x0010),
            # invoke-virtual {v3, v0}, Activity.setContentView(View)
            struct.pack("<HHH", 0x206E, m_set_content, 0x0003),
            # const-string v1, APP_URL
            struct.pack("<HH", 0x011A, s_url),
            # invoke-virtual {v0, v1}, WebView.loadUrl(String)
            struct.pack("<HHH", 0x206E, m_wv_load, 0x0010),
            # return-void
            struct.pack("<H", 0x000E),
        ]
    )
    code_oncreate = (
        struct.pack("<HHHHII", 5, 2, 2, 0, 0, len(oncreate_insns) // 2) + oncreate_insns
    )

    # Layout binary sections
    header_size = 0x70
    string_ids_size = len(raw_strings)
    string_ids_off = header_size

    type_ids_size = len(raw_types)
    type_ids_off = string_ids_off + string_ids_size * 4

    proto_ids_size = len(raw_protos)
    proto_ids_off = type_ids_off + type_ids_size * 4

    method_ids_size = len(raw_methods)
    method_ids_off = proto_ids_off + proto_ids_size * 12

    class_defs_size = 1
    class_defs_off = method_ids_off + method_ids_size * 8

    data_off = class_defs_off + class_defs_size * 32
    cursor = data_off

    # 1. type_list section
    type_lists_blob = bytearray()
    type_list_offsets = {}
    for proto in raw_protos:
        params = proto[2]
        if params and tuple(params) not in type_list_offsets:
            off = cursor + len(type_lists_blob)
            type_list_offsets[tuple(params)] = off
            tl_bytes = struct.pack("<I", len(params)) + struct.pack(
                f"<{len(params)}H", *[t_idx[p] for p in params]
            )
            while len(tl_bytes) % 4 != 0:
                tl_bytes += b"\x00"
            type_lists_blob += tl_bytes
    cursor += len(type_lists_blob)

    # 2. code_item section (4-byte aligned)
    code_blob = bytearray()
    code_init_off = cursor
    code_blob += code_init
    while (cursor + len(code_blob)) % 4 != 0:
        code_blob.append(0)
    code_oncreate_off = cursor + len(code_blob)
    code_blob += code_oncreate
    while (cursor + len(code_blob)) % 4 != 0:
        code_blob.append(0)
    cursor += len(code_blob)

    # 3. string_data_item section
    string_data_offsets = []
    string_data_blob = bytearray()
    for s in raw_strings:
        string_data_offsets.append(cursor + len(string_data_blob))
        utf8_bytes = s.encode("utf-8")
        string_data_blob += uleb128(len(s)) + utf8_bytes + b"\x00"
    cursor += len(string_data_blob)

    # 4. class_data_item section
    class_data_off = cursor
    m_main_init = m_idx[("Lcom/sappystationary/pos/MainActivity;", "<init>", ("V", ()))]
    m_main_oncreate = m_idx[
        ("Lcom/sappystationary/pos/MainActivity;", "onCreate", ("V", ("Landroid/os/Bundle;",)))
    ]
    class_data_blob = bytearray(
        uleb128(0)
        + uleb128(0)
        + uleb128(1)
        + uleb128(1)
        + uleb128(m_main_init)
        + uleb128(0x10001)
        + uleb128(code_init_off)
        + uleb128(m_main_oncreate)
        + uleb128(0x0001)
        + uleb128(code_oncreate_off)
    )
    while (cursor + len(class_data_blob)) % 4 != 0:
        class_data_blob.append(0)
    cursor += len(class_data_blob)

    # 5. map_list section (4-byte aligned)
    map_off = cursor
    map_items = [
        (0x0000, 1, 0),
        (0x0001, string_ids_size, string_ids_off),
        (0x0002, type_ids_size, type_ids_off),
        (0x0003, proto_ids_size, proto_ids_off),
        (0x0005, method_ids_size, method_ids_off),
        (0x0006, class_defs_size, class_defs_off),
        (0x1001, len(type_list_offsets), data_off),
        (0x2001, 2, code_init_off),
        (0x2002, string_ids_size, string_data_offsets[0]),
        (0x2000, 1, class_data_off),
        (0x1000, 1, map_off),
    ]
    map_blob = struct.pack("<I", len(map_items)) + b"".join(
        struct.pack("<HHII", t, 0, sz, off) for t, sz, off in map_items
    )
    cursor += len(map_blob)

    file_size = cursor
    data_size = file_size - data_off

    string_ids_bytes = b"".join(struct.pack("<I", o) for o in string_data_offsets)
    type_ids_bytes = b"".join(struct.pack("<I", s_idx[t]) for t in raw_types)
    proto_ids_bytes = b"".join(
        struct.pack(
            "<III",
            s_idx[shorty],
            t_idx[ret],
            type_list_offsets.get(tuple(params), 0),
        )
        for shorty, ret, params in raw_protos
    )
    method_ids_bytes = b"".join(
        struct.pack("<HHI", t_idx[c], p_idx[proto], s_idx[name])
        for c, name, proto in raw_methods
    )
    class_defs_bytes = struct.pack(
        "<IIIIIIII",
        t_idx["Lcom/sappystationary/pos/MainActivity;"],
        0x0001,
        t_idx["Landroid/app/Activity;"],
        0,
        0xFFFFFFFF,
        0,
        class_data_off,
        0,
    )

    body_after_header = (
        string_ids_bytes
        + type_ids_bytes
        + proto_ids_bytes
        + method_ids_bytes
        + class_defs_bytes
        + bytes(type_lists_blob)
        + bytes(code_blob)
        + bytes(string_data_blob)
        + bytes(class_data_blob)
        + map_blob
    )

    header_tail = struct.pack(
        "<IIIIIIIIIIIIIIIIIIII",
        file_size,
        header_size,
        0x12345678,
        0,
        0,
        map_off,
        string_ids_size,
        string_ids_off,
        type_ids_size,
        type_ids_off,
        proto_ids_size,
        proto_ids_off,
        0,
        0,
        method_ids_size,
        method_ids_off,
        class_defs_size,
        class_defs_off,
        data_size,
        data_off,
    )

    sha1_digest = hashlib.sha1(header_tail + body_after_header).digest()
    adler = zlib.adler32(sha1_digest + header_tail + body_after_header) & 0xFFFFFFFF

    return b"dex\n035\x00" + struct.pack("<I", adler) + sha1_digest + header_tail + body_after_header


# ============================================================================
# 3. MINIMAL VALID RESOURCES.ARSC GENERATOR
# ============================================================================
def build_resources_arsc() -> bytes:
    sp_chunk = struct.pack("<HHIIIIII", 0x0001, 28, 28, 0, 0, 0, 28, 0)
    pkg_name_u16 = PACKAGE_NAME.encode("utf-16le").ljust(256, b"\x00")
    type_sp = struct.pack("<HHIIIIII", 0x0001, 28, 28, 0, 0, 0, 28, 0)
    key_sp = struct.pack("<HHIIIIII", 0x0001, 28, 28, 0, 0, 0, 28, 0)
    pkg_header_size = 288
    pkg_chunk_size = pkg_header_size + len(type_sp) + len(key_sp)
    pkg_header = (
        struct.pack("<HHI", 0x0200, pkg_header_size, pkg_chunk_size)
        + struct.pack("<I", 0x7F)
        + pkg_name_u16
        + struct.pack("<IIIII", pkg_header_size, 0, pkg_header_size + len(type_sp), 0, 0)
    )
    pkg_chunk = pkg_header + type_sp + key_sp
    total_size = 12 + len(sp_chunk) + len(pkg_chunk)
    table_header = struct.pack("<HHII", 0x0002, 12, total_size, 1)
    return table_header + sp_chunk + pkg_chunk


# ============================================================================
# 4. V1 (JAR) + V2 (APK SIGNATURE SCHEME V2) SIGNER & ZIP ASSEMBLER
# ============================================================================
def compute_v2_content_digest(before_sig: bytes, cd: bytes, eocd: bytes) -> bytes:
    chunk_digests = []
    for section in (before_sig, cd, eocd):
        pos = 0
        n = len(section)
        while pos < n:
            chunk = section[pos : pos + 1048576]
            h = hashlib.sha256()
            h.update(b"\xa5" + struct.pack("<I", len(chunk)) + chunk)
            chunk_digests.append(h.digest())
            pos += 1048576
    top = hashlib.sha256()
    top.update(b"\x5a" + struct.pack("<I", len(chunk_digests)) + b"".join(chunk_digests))
    return top.digest()


def make_zip_entry(filename: str, data: bytes, compress: bool, current_offset: int):
    fn_bytes = filename.encode("utf-8")
    crc = zlib.crc32(data) & 0xFFFFFFFF
    uncomp_size = len(data)
    if compress:
        cobj = zlib.compressobj(9, zlib.DEFLATED, -zlib.MAX_WBITS)
        comp_data = cobj.compress(data) + cobj.flush()
        method = 8
    else:
        comp_data = data
        method = 0
    comp_size = len(comp_data)

    extra = b""
    if not compress:
        header_end = current_offset + 30 + len(fn_bytes)
        pad = (4 - (header_end % 4)) % 4
        if pad:
            extra = b"\x00" * pad

    lfh = (
        struct.pack(
            "<IHHHHHIIIHH",
            0x04034B50,
            20,
            0,
            method,
            0,
            0x5421,
            crc,
            comp_size,
            uncomp_size,
            len(fn_bytes),
            len(extra),
        )
        + fn_bytes
        + extra
        + comp_data
    )

    cdh = (
        struct.pack(
            "<IHHHHHHIIIHHHHHII",
            0x02014B50,
            20,
            20,
            0,
            method,
            0,
            0x5421,
            crc,
            comp_size,
            uncomp_size,
            len(fn_bytes),
            0,
            0,
            0,
            0,
            0,
            current_offset,
        )
        + fn_bytes
    )
    return lfh, cdh


def build_signed_apk(output_path: str):
    print("Generating binary AndroidManifest.xml...")
    manifest_bytes = build_axml()

    print("Generating Dalvik classes.dex...")
    dex_bytes = build_dex()

    print("Generating resources.arsc...")
    arsc_bytes = build_resources_arsc()

    # Ensure web app is built
    workspace_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    dist_dir = os.path.join(workspace_root, "dist")
    if not os.path.exists(os.path.join(dist_dir, "index.html")):
        print("Building web frontend with Vite...")
        subprocess.run(["npm", "run", "build"], cwd=workspace_root, check=True)

    # Collect all offline assets to bundle into APK
    raw_files = [
        ("AndroidManifest.xml", manifest_bytes, True),
        ("classes.dex", dex_bytes, True),
        ("resources.arsc", arsc_bytes, False),
    ]

    for root, _, files in os.walk(dist_dir):
        for file in sorted(files):
            if file.endswith(".apk") or file.endswith(".map"):
                continue
            full_path = os.path.join(root, file)
            rel_path = os.path.relpath(full_path, dist_dir).replace("\\", "/")
            with open(full_path, "rb") as f:
                content = f.read()

            # For universal Android WebView compatibility on file:/// URLs,
            # allow standard script execution
            if rel_path == "index.html":
                text = content.decode("utf-8")
                # Remove type="module" crossorigin so WebView handles it as a standard classic script
                text = text.replace('type="module" crossorigin ', "")
                text = text.replace('type="module" ', "")
                content = text.encode("utf-8")

            zip_name = f"assets/{rel_path}"
            raw_files.append((zip_name, content, True))

    with tempfile.TemporaryDirectory() as tmpdir:
        # Generate RSA signing key
        key_pem = os.path.join(tmpdir, "key.pem")
        cert_pem = os.path.join(tmpdir, "cert.pem")
        cert_der = os.path.join(tmpdir, "cert.der")
        pub_der = os.path.join(tmpdir, "pub.der")

        subprocess.run(
            [
                "openssl",
                "req",
                "-x509",
                "-newkey",
                "rsa:2048",
                "-keyout",
                key_pem,
                "-out",
                cert_pem,
                "-days",
                "10000",
                "-nodes",
                "-subj",
                "/CN=SappyPOS/O=Sappy Stationary/C=ET",
            ],
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        subprocess.run(
            ["openssl", "x509", "-in", cert_pem, "-outform", "DER", "-out", cert_der],
            check=True,
        )
        subprocess.run(
            ["openssl", "rsa", "-in", key_pem, "-pubout", "-outform", "DER", "-out", pub_der],
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )

        # Build META-INF/MANIFEST.MF
        def b64_sha256(b: bytes) -> str:
            return base64.b64encode(hashlib.sha256(b).digest()).decode("ascii")

        mf_entries = []
        for name, blob, _ in raw_files:
            entry = f"Name: {name}\r\nSHA-256-Digest: {b64_sha256(blob)}\r\n\r\n"
            mf_entries.append((name, entry))

        manifest_mf = (
            "Manifest-Version: 1.0\r\nCreated-By: 1.0 (Sappy Stationary POS Universal)\r\n\r\n"
            + "".join(e for _, e in mf_entries)
        ).encode("utf-8")

        # Build META-INF/CERT.SF
        sf_lines = [
            "Signature-Version: 1.0\r\n",
            f"SHA-256-Digest-Manifest: {b64_sha256(manifest_mf)}\r\n",
            "X-Android-APK-Signed: 2\r\n\r\n",
        ]
        for name, entry in mf_entries:
            sf_lines.append(
                f"Name: {name}\r\nSHA-256-Digest: {b64_sha256(entry.encode('utf-8'))}\r\n\r\n"
            )
        cert_sf = "".join(sf_lines).encode("utf-8")

        sf_path = os.path.join(tmpdir, "CERT.SF")
        rsa_path = os.path.join(tmpdir, "CERT.RSA")
        with open(sf_path, "wb") as f:
            f.write(cert_sf)

        subprocess.run(
            [
                "openssl",
                "cms",
                "-sign",
                "-binary",
                "-noattr",
                "-in",
                sf_path,
                "-signer",
                cert_pem,
                "-inkey",
                key_pem,
                "-outform",
                "DER",
                "-out",
                rsa_path,
                "-md",
                "sha256",
            ],
            check=True,
        )
        with open(rsa_path, "rb") as f:
            cert_rsa = f.read()

        # Final list of files packed into ZIP
        files_to_pack = list(raw_files) + [
            ("META-INF/MANIFEST.MF", manifest_mf, True),
            ("META-INF/CERT.SF", cert_sf, True),
            ("META-INF/CERT.RSA", cert_rsa, True),
        ]

        lfh_blobs = bytearray()
        cd_blobs = bytearray()
        for fname, fbytes, comp in files_to_pack:
            lfh, cdh = make_zip_entry(fname, fbytes, comp, len(lfh_blobs))
            lfh_blobs += lfh
            cd_blobs += cdh

        # Construct APK Signature Scheme v2 Block
        with open(cert_der, "rb") as f:
            cert_der_bytes = f.read()
        with open(pub_der, "rb") as f:
            pub_der_bytes = f.read()

        def build_v2_block(digest_bytes: bytes) -> bytes:
            digest_entry = struct.pack("<I", 0x0103) + struct.pack("<I", len(digest_bytes)) + digest_bytes
            digests_seq = struct.pack("<I", len(digest_entry)) + digest_entry
            certs_seq = struct.pack("<I", len(cert_der_bytes)) + cert_der_bytes
            add_attrs = b""
            signed_data = (
                struct.pack("<I", len(digests_seq))
                + digests_seq
                + struct.pack("<I", len(certs_seq))
                + certs_seq
                + struct.pack("<I", len(add_attrs))
                + add_attrs
            )

            sd_path = os.path.join(tmpdir, "signed_data.bin")
            sig_path = os.path.join(tmpdir, "sig.bin")
            with open(sd_path, "wb") as f:
                f.write(signed_data)
            subprocess.run(
                ["openssl", "dgst", "-sha256", "-sign", key_pem, "-out", sig_path, sd_path],
                check=True,
            )
            with open(sig_path, "rb") as f:
                sig_bytes = f.read()

            sig_entry = struct.pack("<I", 0x0103) + struct.pack("<I", len(sig_bytes)) + sig_bytes
            sigs_seq = struct.pack("<I", len(sig_entry)) + sig_entry

            signer = (
                struct.pack("<I", len(signed_data))
                + signed_data
                + struct.pack("<I", len(sigs_seq))
                + sigs_seq
                + struct.pack("<I", len(pub_der_bytes))
                + pub_der_bytes
            )
            signers_seq = struct.pack("<I", len(signer)) + signer
            v2_payload = struct.pack("<I", len(signers_seq)) + signers_seq

            pair_body = struct.pack("<I", 0x7109871A) + v2_payload
            pair = struct.pack("<Q", len(pair_body)) + pair_body

            raw_block_len = 8 + len(pair) + 8 + 16
            rem = raw_block_len % 4096
            padding_pair = b""
            if rem != 0:
                needed = 4096 - rem
                if needed < 12:
                    needed += 4096
                pad_val_len = needed - 12
                pad_body = struct.pack("<I", 0x42726577) + (b"\x00" * pad_val_len)
                padding_pair = struct.pack("<Q", len(pad_body)) + pad_body

            all_pairs = pair + padding_pair
            size_of_block = len(all_pairs) + 8 + 16
            return (
                struct.pack("<Q", size_of_block)
                + all_pairs
                + struct.pack("<Q", size_of_block)
                + b"APK Sig Block 42"
            )

        dummy_v2 = build_v2_block(b"\x00" * 32)
        cd_offset_with_v2 = len(lfh_blobs) + len(dummy_v2)

        eocd_for_digest = struct.pack(
            "<IHHHHIIH",
            0x06054B50,
            0,
            0,
            len(files_to_pack),
            len(files_to_pack),
            len(cd_blobs),
            len(lfh_blobs),
            0,
        )
        real_digest = compute_v2_content_digest(bytes(lfh_blobs), bytes(cd_blobs), eocd_for_digest)
        real_v2_block = build_v2_block(real_digest)

        final_eocd = struct.pack(
            "<IHHHHIIH",
            0x06054B50,
            0,
            0,
            len(files_to_pack),
            len(files_to_pack),
            len(cd_blobs),
            cd_offset_with_v2,
            0,
        )

        os.makedirs(os.path.dirname(output_path), exist_ok=True)
        with open(output_path, "wb") as f:
            f.write(lfh_blobs)
            f.write(real_v2_block)
            f.write(cd_blobs)
            f.write(final_eocd)

    print(
        f"Successfully built signed universal Android APK: {output_path} ({os.path.getsize(output_path)} bytes, {len(files_to_pack)} bundled files)"
    )


if __name__ == "__main__":
    out_apk = os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
        "public",
        "sappy-stationary-pos.apk",
    )
    build_signed_apk(out_apk)
