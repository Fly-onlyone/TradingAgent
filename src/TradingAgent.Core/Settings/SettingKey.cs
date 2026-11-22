using System.Text.Json.Serialization.Metadata;

namespace TradingAgent.Core.Settings;

/// <summary>A typed application setting: its storage name, its default, and how its value is serialized.</summary>
/// <param name="Name">Storage key, lowercase with dots, for example <c>okx.sandbox</c>.</param>
/// <param name="DefaultValue">Returned while the setting has never been saved.</param>
/// <param name="TypeInfo">Source-generated JSON metadata; reflection-based serialization is unavailable under Native AOT.</param>
public sealed record SettingKey<T>(string Name, T DefaultValue, JsonTypeInfo<T> TypeInfo);
