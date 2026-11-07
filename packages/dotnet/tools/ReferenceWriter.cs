using System.Globalization;
using System.Reflection;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using System.Xml;
using System.Xml.Linq;

/// <summary>Builds human reference input separately from the immutable ABI snapshot format.</summary>
internal static class ReferenceWriter
{
  private const BindingFlags Flags = BindingFlags.Public | BindingFlags.Instance | BindingFlags.Static | BindingFlags.DeclaredOnly;
  private static readonly NullabilityInfoContext Nullability = new();

  /// <summary>Generates or checks deterministic reference bytes from reviewed compiled declarations and XML.</summary>
  internal static void Write(Assembly assembly, Type[] types, object snapshot, string xmlPath, string baselinePath, string outputPath, bool check)
  {
    if (!JsonNode.DeepEquals(JsonNode.Parse(File.ReadAllText(baselinePath)), JsonSerializer.SerializeToNode(snapshot)))
      throw new InvalidOperationException("Compiled API differs from the reviewed API baseline.");
    using var reader = XmlReader.Create(xmlPath, new XmlReaderSettings { DtdProcessing = DtdProcessing.Prohibit, XmlResolver = null });
    var xml = XDocument.Load(reader).Descendants("member").ToDictionary(m => (string?)m.Attribute("name") ?? throw new InvalidOperationException("XML member lacks an ID."), StringComparer.Ordinal);
    var known = types.SelectMany(t => t.GetMembers(Flags).Append(t)).Where(m => m is Type or MethodBase or PropertyInfo or FieldInfo or EventInfo).GroupBy(MemberId, StringComparer.Ordinal).ToDictionary(group => group.Key, group => group.First(), StringComparer.Ordinal);
    var version = (assembly.GetCustomAttribute<AssemblyInformationalVersionAttribute>()?.InformationalVersion ?? assembly.GetName().Version?.ToString() ?? "").Split('+')[0];
    var reference = new
    {
      schemaVersion = 1,
      package = new { id = "Hashbrown.AspNetCore", version, status = "unreleased" },
      types = types.OrderBy(t => t.FullName, StringComparer.Ordinal).Select(t =>
      {
        var id = MemberId(t);
        if (!xml.ContainsKey(id)) throw new InvalidOperationException("Missing XML documentation: " + id);
        return new
        {
          id,
          name = SnapshotTypeName(t),
          slug = (t.FullName ?? t.Name).Replace('+', '.').Replace((char)96, '-'),
          declaration = TypeDeclaration(t),
          docs = Documentation(t, xml, known),
          members = t.GetMembers(Flags).Where(m => m is MethodBase or PropertyInfo or FieldInfo or EventInfo)
            .Where(m => m is not MethodInfo method || !method.IsSpecialName)
            .Where(m => m is not FieldInfo field || !field.IsSpecialName)
            .Where(m => xml.ContainsKey(MemberId(m)))
            .OrderBy(MemberId, StringComparer.Ordinal)
            .Select(m => new
            {
              id = MemberId(m),
              name = m is ConstructorInfo ? t.Name.Split((char)96)[0] : m.Name,
              anchor = "member-" + Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(MemberId(m))))[..24],
              declaration = MemberDeclaration(m),
              docs = Documentation(m, xml, known)
            }).ToArray()
        };
      }).ToArray()
    };
    var bytes = JsonSerializer.Serialize(reference, new JsonSerializerOptions { WriteIndented = true }) + "\n";
    if (check)
    {
      if (!File.Exists(outputPath)) throw new InvalidOperationException("Missing generated reference; generate reference-docs.json.");
      if (File.ReadAllText(outputPath) != bytes) throw new InvalidOperationException("Stale generated reference; regenerate reference-docs.json from compiled XML and reviewed API.");
    }
    else File.WriteAllText(outputPath, bytes, new UTF8Encoding(false));
    Console.WriteLine($"{(check ? "Validated" : "Generated")} C# reference for {types.Length} reviewed public types.");
  }

  private static string SnapshotTypeName(Type type) => type.IsGenericParameter ? (type.DeclaringMethod is null ? "!" : "!!") + type.GenericParameterPosition + ":" + type.Name : type.IsByRef ? SnapshotTypeName(type.GetElementType()!) + "&" : type.IsArray ? SnapshotTypeName(type.GetElementType()!) + "[" + new string(',', type.GetArrayRank() - 1) + "]" : type.IsGenericType ? type.GetGenericTypeDefinition().FullName! + "<" + string.Join(",", type.GetGenericArguments().Select(SnapshotTypeName)) + ">" : type.FullName ?? type.Name;

  private static string XmlType(Type type)
  {
    if (type.IsGenericParameter) return new string((char)96, type.DeclaringMethod is null ? 1 : 2) + type.GenericParameterPosition;
    if (type.IsByRef) return XmlType(type.GetElementType()!) + "@";
    if (type.IsPointer) return XmlType(type.GetElementType()!) + "*";
    if (type.IsArray) return XmlType(type.GetElementType()!) + (type.GetArrayRank() == 1 ? "[]" : "[" + string.Join(",", Enumerable.Repeat("0:", type.GetArrayRank())) + "]");
    if (!type.IsGenericType) return (type.FullName ?? type.Name).Replace('+', '.');
    var arguments = type.GetGenericArguments();
    var position = 0;
    return Regex.Replace(type.GetGenericTypeDefinition().FullName!.Replace('+', '.'), @"\x60(\d+)", match =>
    {
      var count = int.Parse(match.Groups[1].Value, CultureInfo.InvariantCulture);
      var result = "{" + string.Join(",", arguments.Skip(position).Take(count).Select(XmlType)) + "}";
      position += count;
      return result;
    });
  }

  private static string MemberId(MemberInfo member)
  {
    if (member is Type type) return "T:" + type.FullName!.Replace('+', '.');
    var prefix = member switch { MethodBase => "M:", PropertyInfo => "P:", FieldInfo => "F:", EventInfo => "E:", _ => throw new InvalidOperationException("Unsupported XML declaration.") };
    var name = member is ConstructorInfo ? "#ctor" : member.Name.Replace('.', '#');
    if (member is MethodInfo method && method.IsGenericMethod) name += new string((char)96, 2) + method.GetGenericArguments().Length;
    var parameters = member switch { MethodBase m => m.GetParameters(), PropertyInfo p => p.GetIndexParameters(), _ => [] };
    return prefix + member.DeclaringType!.FullName!.Replace('+', '.') + "." + name + (parameters.Length == 0 ? "" : "(" + string.Join(",", parameters.Select(p => XmlType(p.ParameterType))) + ")") + (member is MethodInfo conversion && conversion.Name is "op_Implicit" or "op_Explicit" ? "~" + XmlType(conversion.ReturnType) : "");
  }

  private static object Documentation(MemberInfo member, Dictionary<string, XElement> xml, Dictionary<string, MemberInfo> known)
  {
    var element = ResolveDocumentation(member, xml, known, []) ?? new XElement("member");
    var inherited = element.Elements("inheritdoc").Select(e => new { target = (string?)e.Attribute("cref") ?? InheritedId(member) ?? "Inherited documentation", text = "Inherited documentation" });
    return new
    {
      summary = Text(element.Element("summary")),
      remarks = Text(element.Element("remarks")),
      returns = Text(element.Element("returns") ?? element.Element("value")),
      @params = element.Elements("param").Select(e => new { name = (string?)e.Attribute("name") ?? "", description = Text(e) }).ToArray(),
      typeParams = element.Elements("typeparam").Select(e => new { name = (string?)e.Attribute("name") ?? "", description = Text(e) }).ToArray(),
      references = element.Descendants().Where(e => e.Name.LocalName is "see" or "seealso").Where(e => e.Attribute("cref") is not null).Select(e => new { target = (string)e.Attribute("cref")!, text = string.IsNullOrWhiteSpace(e.Value) ? ((string)e.Attribute("cref")!)[2..] : Text(e) }).Concat(inherited).Distinct().OrderBy(r => r.target, StringComparer.Ordinal).ToArray()
    };
  }

  private static XElement? ResolveDocumentation(MemberInfo member, Dictionary<string, XElement> xml, Dictionary<string, MemberInfo> known, HashSet<string> visited)
  {
    var id = MemberId(member);
    if (!visited.Add(id) || !xml.TryGetValue(id, out var element)) return null;
    var inherit = element.Element("inheritdoc");
    if (inherit is null) return element;
    var target = (string?)inherit.Attribute("cref") ?? InheritedId(member);
    if (target is null || !known.TryGetValue(target, out var parent)) return element;
    var resolved = ResolveDocumentation(parent, xml, known, visited);
    if (resolved is null) return element;
    return new XElement("member", element.Elements().Where(e => e.Name != "inheritdoc"), resolved.Elements().Where(e => !element.Elements(e.Name).Any()));
  }

  private static string? InheritedId(MemberInfo member)
  {
    if (member is MethodInfo method)
    {
      var parent = method.GetBaseDefinition();
      if (parent != method) return MemberId(parent);
      if (method.DeclaringType is { IsInterface: false } declaring)
      {
        foreach (var contract in declaring.GetInterfaces().OrderBy(t => t.FullName, StringComparer.Ordinal))
        {
          var map = declaring.GetInterfaceMap(contract);
          var index = Array.IndexOf(map.TargetMethods, method);
          if (index >= 0) return MemberId(map.InterfaceMethods[index]);
        }
      }
    }
    return member is Type type && type.BaseType is not null ? MemberId(type.BaseType) : null;
  }

  private static string Text(XElement? element)
  {
    if (element is null) return "";
    string Render(XNode node) => node switch
    {
      XText text => text.Value,
      XElement e when e.Name.LocalName is "see" or "seealso" => string.IsNullOrWhiteSpace(e.Value) ? ((string?)e.Attribute("cref"))?[2..] ?? (string?)e.Attribute("langword") ?? "" : e.Value,
      XElement e when e.Name.LocalName is "paramref" or "typeparamref" => (string?)e.Attribute("name") ?? "",
      XElement e when e.Name.LocalName is "para" or "code" => "\n\n" + string.Concat(e.Nodes().Select(Render)).Trim() + "\n\n",
      XElement e => string.Concat(e.Nodes().Select(Render)),
      _ => ""
    };
    return Regex.Replace(Regex.Replace(string.Concat(element.Nodes().Select(Render)), @"[^\S\n]+", " "), @" *\n *", "\n").Trim();
  }

  private static string CSharpType(Type type, NullabilityInfo? info = null)
  {
    if (type.IsByRef) return CSharpType(type.GetElementType()!, info?.ElementType ?? info);
    if (type.IsPointer) return CSharpType(type.GetElementType()!) + "*";
    if (type.IsArray) return CSharpType(type.GetElementType()!, info?.ElementType) + "[" + new string(',', type.GetArrayRank() - 1) + "]" + (info?.ReadState == NullabilityState.Nullable ? "?" : "");
    if (Nullable.GetUnderlyingType(type) is { } underlying) return CSharpType(underlying, info?.GenericTypeArguments.FirstOrDefault()) + "?";
    var aliases = new Dictionary<Type, string> { [typeof(void)] = "void", [typeof(string)] = "string", [typeof(object)] = "object", [typeof(bool)] = "bool", [typeof(byte)] = "byte", [typeof(sbyte)] = "sbyte", [typeof(short)] = "short", [typeof(ushort)] = "ushort", [typeof(int)] = "int", [typeof(uint)] = "uint", [typeof(long)] = "long", [typeof(ulong)] = "ulong", [typeof(float)] = "float", [typeof(double)] = "double", [typeof(decimal)] = "decimal", [typeof(char)] = "char" };
    var name = aliases.TryGetValue(type, out var alias) ? alias : type.IsGenericParameter ? type.Name : (type.FullName ?? type.Name).Split((char)96)[0].Replace('+', '.');
    if (type.IsGenericType) name += "<" + string.Join(", ", type.GetGenericArguments().Select((argument, index) => CSharpType(argument, info?.GenericTypeArguments.ElementAtOrDefault(index)))) + ">";
    return name + (!type.IsValueType && info?.ReadState == NullabilityState.Nullable ? "?" : "");
  }

  private static string Literal(object? value, Type type)
  {
    if (value is null) return type.IsValueType && Nullable.GetUnderlyingType(type) is null ? "default" : "null";
    if (type.IsEnum) return CSharpType(type) + "." + Enum.GetName(type, value);
    return value switch
    {
      string text => JsonSerializer.Serialize(text),
      char character => "'" + (character == '\'' ? "\\'" : character == '\\' ? "\\\\" : character.ToString()) + "'",
      bool boolean => boolean ? "true" : "false",
      float number => number.ToString("R", CultureInfo.InvariantCulture) + "f",
      double number => number.ToString("R", CultureInfo.InvariantCulture) + "d",
      decimal number => number.ToString(CultureInfo.InvariantCulture) + "m",
      long number => number.ToString(CultureInfo.InvariantCulture) + "L",
      ulong number => number.ToString(CultureInfo.InvariantCulture) + "UL",
      uint number => number.ToString(CultureInfo.InvariantCulture) + "U",
      _ => Convert.ToString(value, CultureInfo.InvariantCulture) ?? "default"
    };
  }

  private static string Parameter(ParameterInfo parameter, bool extension = false)
  {
    var modifier = parameter.GetCustomAttribute<ParamArrayAttribute>() is not null ? "params " : parameter.IsOut ? "out " : parameter.ParameterType.IsByRef ? parameter.IsIn ? "in " : "ref " : extension ? "this " : "";
    return modifier + CSharpType(parameter.ParameterType, Nullability.Create(parameter)) + " " + parameter.Name + (parameter.HasDefaultValue ? " = " + Literal(parameter.DefaultValue, parameter.ParameterType) : "");
  }

  private static string Constraints(IEnumerable<Type> arguments) => string.Concat(arguments.Where(t => t.IsGenericParameter).Select(t =>
  {
    var flags = t.GenericParameterAttributes;
    var constraints = new List<string>();
    if (flags.HasFlag(GenericParameterAttributes.ReferenceTypeConstraint)) constraints.Add("class");
    if (flags.HasFlag(GenericParameterAttributes.NotNullableValueTypeConstraint)) constraints.Add("struct");
    constraints.AddRange(t.GetGenericParameterConstraints().Where(c => c != typeof(ValueType)).Select(c => CSharpType(c)));
    if (flags.HasFlag(GenericParameterAttributes.DefaultConstructorConstraint) && !flags.HasFlag(GenericParameterAttributes.NotNullableValueTypeConstraint)) constraints.Add("new()");
    return constraints.Count == 0 ? "" : " where " + t.Name + " : " + string.Join(", ", constraints);
  }));

  private static string TypeDeclaration(Type type)
  {
    var name = type.Name.Split((char)96)[0] + (type.IsGenericTypeDefinition ? "<" + string.Join(", ", type.GetGenericArguments().Select(t => t.Name)) + ">" : "");
    var kind = type.IsInterface ? "interface" : type.IsEnum ? "enum" : type.IsValueType ? "struct" : type.GetMethod("<Clone>$") is not null ? "record" : "class";
    var modifiers = type.IsAbstract && type.IsSealed ? "static " : type.IsAbstract && !type.IsInterface ? "abstract " : type.IsSealed && !type.IsValueType ? "sealed " : "";
    var parents = (type.BaseType is { } parent && parent != typeof(object) && parent != typeof(ValueType) && parent != typeof(Enum) ? new[] { parent } : []).Concat(type.GetInterfaces()).Select(t => CSharpType(t)).Order(StringComparer.Ordinal).ToArray();
    return "public " + modifiers + kind + " " + name + (parents.Length == 0 ? "" : " : " + string.Join(", ", parents)) + Constraints(type.GetGenericArguments());
  }

  private static string MemberDeclaration(MemberInfo member)
  {
    switch (member)
    {
      case ConstructorInfo constructor:
        return "public " + constructor.DeclaringType!.Name.Split((char)96)[0] + "(" + string.Join(", ", constructor.GetParameters().Select(p => Parameter(p))) + ");";
      case MethodInfo method:
        var generic = method.IsGenericMethod ? "<" + string.Join(", ", method.GetGenericArguments().Select(t => t.Name)) + ">" : "";
        var extension = method.GetCustomAttribute<System.Runtime.CompilerServices.ExtensionAttribute>() is not null;
        var modifier = method.IsStatic ? "static " : method.IsAbstract && !method.DeclaringType!.IsInterface ? "abstract " : "";
        var returnModifier = method.ReturnType.IsByRef ? method.ReturnParameter.GetRequiredCustomModifiers().Any(t => t.Name == "InAttribute") ? "ref readonly " : "ref " : "";
        return "public " + modifier + returnModifier + CSharpType(method.ReturnType, Nullability.Create(method.ReturnParameter)) + " " + method.Name + generic + "(" + string.Join(", ", method.GetParameters().Select((p, i) => Parameter(p, extension && i == 0))) + ")" + Constraints(method.GetGenericArguments()) + ";";
      case PropertyInfo property:
        var accessor = property.GetMethod ?? property.SetMethod!;
        var index = property.GetIndexParameters();
        var name = index.Length == 0 ? property.Name : "this[" + string.Join(", ", index.Select(p => Parameter(p))) + "]";
        var setter = property.SetMethod;
        var setterName = setter?.ReturnParameter.GetRequiredCustomModifiers().Any(t => t.Name == "IsExternalInit") == true ? "init" : "set";
        return "public " + (accessor.IsStatic ? "static " : "") + CSharpType(property.PropertyType, Nullability.Create(property)) + " " + name + " { " + (property.GetMethod?.IsPublic == true ? "get; " : "") + (setter?.IsPublic == true ? setterName + "; " : "") + "}";
      case FieldInfo field:
        if (field.DeclaringType!.IsEnum) return field.Name + " = " + Convert.ToString(field.GetRawConstantValue(), CultureInfo.InvariantCulture) + ",";
        return "public " + (field.IsLiteral ? "const " : field.IsStatic ? "static " : "") + (field.IsInitOnly ? "readonly " : "") + CSharpType(field.FieldType, Nullability.Create(field)) + " " + field.Name + (field.IsLiteral ? " = " + Literal(field.GetRawConstantValue(), field.FieldType) : "") + ";";
      case EventInfo @event:
        return "public " + (@event.AddMethod?.IsStatic == true ? "static " : "") + "event " + CSharpType(@event.EventHandlerType!) + " " + @event.Name + ";";
      default: throw new InvalidOperationException("Unsupported C# declaration.");
    }
  }
}
