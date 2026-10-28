using System.Reflection;
using System.Runtime.Loader;
using System.Text.Json;
using System.Xml.Linq;

var assemblyPath = Path.GetFullPath(args[0]);
AssemblyLoadContext.Default.Resolving += (_, name) =>
{
  var path = Path.Combine(Path.GetDirectoryName(assemblyPath)!, name.Name + ".dll");
  return File.Exists(path) ? AssemblyLoadContext.Default.LoadFromAssemblyPath(path) : null;
};
var assembly = AssemblyLoadContext.Default.LoadFromAssemblyPath(assemblyPath);
var prefix = args[1];
var nullability = new NullabilityInfoContext();
const BindingFlags flags = BindingFlags.Public | BindingFlags.Instance | BindingFlags.Static | BindingFlags.DeclaredOnly;
string Normalize(string value) => value.Replace(prefix, "Hashbrown.AspNetCore").Replace("Hashbrown.Conformance,", "Hashbrown.AspNetCore,");
string TypeName(Type type) => type.IsGenericParameter ? (type.DeclaringMethod is null ? "!" : "!!") + type.GenericParameterPosition + ":" + type.Name : type.IsByRef ? TypeName(type.GetElementType()!) + "&" : type.IsArray ? TypeName(type.GetElementType()!) + "[" + new string(',', type.GetArrayRank() - 1) + "]" : type.IsGenericType ? Normalize(type.GetGenericTypeDefinition().FullName!) + "<" + string.Join(",", type.GetGenericArguments().Select(TypeName)) + ">" : Normalize(type.FullName ?? type.Name);
string Nulls(NullabilityInfo info) => $"{info.ReadState}/{info.WriteState}[{string.Join(",", info.GenericTypeArguments.Select(Nulls))}]{(info.ElementType is null ? "" : Nulls(info.ElementType))}";
string Generics(IEnumerable<Type> types) => string.Join(";", types.Where(t => t.IsGenericParameter).Select(t => $"{t.Name}:{t.GenericParameterAttributes}:{string.Join(",", t.GetGenericParameterConstraints().Select(TypeName).Order())}:{string.Join(",", t.CustomAttributes.Select(a => a.ToString()).Order())}"));
string Modifiers(Type[] required, Type[] optional) => string.Concat(required.Select(t => $" modreq({TypeName(t)})").Concat(optional.Select(t => $" modopt({TypeName(t)})")));
string Parameter(ParameterInfo p) => $"{TypeName(p.ParameterType)} {p.Name} in={p.IsIn} out={p.IsOut} optional={p.IsOptional} default={(p.HasDefaultValue ? JsonSerializer.Serialize(p.DefaultValue) : "<none>")} nullable={Nulls(nullability.Create(p))}{Modifiers(p.GetRequiredCustomModifiers(), p.GetOptionalCustomModifiers())}";
string Method(MethodBase m) => $"{m.Attributes} {m.Name}<{Generics(m is MethodInfo mi ? mi.GetGenericArguments() : [])}>({string.Join(",", m.GetParameters().Select(Parameter))})" + (m is MethodInfo method ? $":{TypeName(method.ReturnType)} nullable={Nulls(nullability.Create(method.ReturnParameter))}{Modifiers(method.ReturnParameter.GetRequiredCustomModifiers(), method.ReturnParameter.GetOptionalCustomModifiers())}" : "");
var types = assembly.GetExportedTypes().Where(t => t.Namespace == prefix || t.Namespace?.StartsWith(prefix + ".", StringComparison.Ordinal) == true).OrderBy(TypeName).ToArray();
if (prefix == "Hashbrown.AspNetCore" && (assembly.EntryPoint is not null || assembly.GetExportedTypes().Length != types.Length))
  throw new InvalidOperationException("Library contains an entry point or exported namespace outside Hashbrown.AspNetCore.");
var snapshot = new
{
  types = types.Select(t => new
  {
    name = TypeName(t),
    attributes = t.Attributes.ToString(),
    baseType = t.BaseType is null ? null : TypeName(t.BaseType),
    interfaces = t.GetInterfaces().Select(TypeName).Order().ToArray(),
    generics = Generics(t.GetGenericArguments()),
    members = t.GetMembers(flags).Where(m => m is MethodBase or PropertyInfo or FieldInfo or EventInfo).Select(m => m switch
    {
      MethodBase method => "method " + Method(method),
      PropertyInfo property => $"property {TypeName(property.PropertyType)} {property.Name}({string.Join(",", property.GetIndexParameters().Select(Parameter))}) get={property.GetMethod?.Attributes} set={property.SetMethod?.Attributes} nullable={Nulls(nullability.Create(property))}{Modifiers(property.GetRequiredCustomModifiers(), property.GetOptionalCustomModifiers())}",
      FieldInfo field => $"field {field.Attributes} {TypeName(field.FieldType)} {field.Name} value={(field.IsLiteral ? JsonSerializer.Serialize(field.GetRawConstantValue()) : "<none>")} nullable={Nulls(nullability.Create(field))}{Modifiers(field.GetRequiredCustomModifiers(), field.GetOptionalCustomModifiers())}",
      EventInfo ev => $"event {TypeName(ev.EventHandlerType!)} {ev.Name} add={ev.AddMethod?.Attributes} remove={ev.RemoveMethod?.Attributes}",
      _ => throw new InvalidOperationException()
    }).Order().ToArray()
  }).ToArray()
};
File.WriteAllText(args[2], JsonSerializer.Serialize(snapshot, new JsonSerializerOptions { WriteIndented = true }) + "\n");
if (args.Length > 3)
{
  // CS1591 covers authored declarations; records synthesize undocumented members.
  var documented = XDocument.Load(args[3]).Descendants("member").Select(m => (string?)m.Attribute("name")).ToHashSet();
  foreach (var type in types)
  {
    var id = "T:" + type.FullName!.Replace('+', '.');
    if (!documented.Contains(id)) throw new InvalidOperationException("Missing XML documentation: " + id);
  }
  Console.WriteLine($"Validated XML documentation for {types.Length} public types; compiler enforces authored member coverage.");
}
Console.WriteLine($"Captured {types.Length} public types from {assembly.GetName().Name}.");
