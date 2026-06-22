import type { Completion } from "@codemirror/autocomplete";
import { snippetCompletion } from "@codemirror/autocomplete";

// Static Jinja2 autocompletion data with English help text. Kept approximate but
// useful: it covers the common tags, snippets, builtin filters/tests and the two
// project filters (hash, ipaddr). Not a language server.

// Statement keywords/tags usable inside {% ... %}.
export const KEYWORDS: Completion[] = [
  { label: "if", type: "keyword", detail: "tag", info: "Conditional block. Example: {% if user %}…{% endif %}" },
  { label: "elif", type: "keyword", detail: "tag", info: "Else-if branch inside an {% if %} block." },
  { label: "else", type: "keyword", detail: "tag", info: "Fallback branch for {% if %} / {% for %}." },
  { label: "endif", type: "keyword", detail: "tag", info: "Closes an {% if %} block." },
  { label: "for", type: "keyword", detail: "tag", info: "Loop over a sequence. Example: {% for x in items %}…{% endfor %}" },
  { label: "endfor", type: "keyword", detail: "tag", info: "Closes a {% for %} loop." },
  { label: "in", type: "keyword", detail: "operator", info: "Membership / loop operator. Example: {% for x in items %}" },
  { label: "set", type: "keyword", detail: "tag", info: "Assign a variable. Example: {% set port = 8080 %}" },
  { label: "endset", type: "keyword", detail: "tag", info: "Closes a block {% set %}." },
  { label: "macro", type: "keyword", detail: "tag", info: "Define a reusable macro. Example: {% macro row(x) %}…{% endmacro %}" },
  { label: "endmacro", type: "keyword", detail: "tag", info: "Closes a {% macro %} definition." },
  { label: "call", type: "keyword", detail: "tag", info: "Call a macro with a block body." },
  { label: "endcall", type: "keyword", detail: "tag", info: "Closes a {% call %} block." },
  { label: "block", type: "keyword", detail: "tag", info: "Named, overridable template block (inheritance)." },
  { label: "endblock", type: "keyword", detail: "tag", info: "Closes a {% block %}." },
  { label: "extends", type: "keyword", detail: "tag", info: 'Inherit from a base template. Example: {% extends "base.j2" %}' },
  { label: "include", type: "keyword", detail: "tag", info: 'Include another template. Example: {% include "part.j2" %}' },
  { label: "import", type: "keyword", detail: "tag", info: "Import macros from another template." },
  { label: "from", type: "keyword", detail: "tag", info: "Import specific names from a template." },
  { label: "with", type: "keyword", detail: "tag", info: "Create a new inner scope. Example: {% with foo = 1 %}…{% endwith %}" },
  { label: "endwith", type: "keyword", detail: "tag", info: "Closes a {% with %} scope." },
  { label: "filter", type: "keyword", detail: "tag", info: "Apply a filter to a whole block. Example: {% filter upper %}…{% endfilter %}" },
  { label: "endfilter", type: "keyword", detail: "tag", info: "Closes a {% filter %} block." },
  { label: "autoescape", type: "keyword", detail: "tag", info: "Toggle autoescaping for a block." },
  { label: "endautoescape", type: "keyword", detail: "tag", info: "Closes an {% autoescape %} block." },
  { label: "raw", type: "keyword", detail: "tag", info: "Output literal text without parsing Jinja. {% raw %}…{% endraw %}" },
  { label: "endraw", type: "keyword", detail: "tag", info: "Closes a {% raw %} block." },
  { label: "is", type: "keyword", detail: "operator", info: "Apply a test. Example: {% if x is defined %}" },
  { label: "not", type: "keyword", detail: "operator", info: "Boolean negation." },
  { label: "and", type: "keyword", detail: "operator", info: "Boolean AND." },
  { label: "or", type: "keyword", detail: "operator", info: "Boolean OR." },
  { label: "true", type: "constant", detail: "literal", info: "Boolean true." },
  { label: "false", type: "constant", detail: "literal", info: "Boolean false." },
  { label: "none", type: "constant", detail: "literal", info: "Null value." },
];

// Snippets for the most common Jinja constructs. Triggered by their label.
export const SNIPPETS: Completion[] = [
  snippetCompletion("{% for ${item} in ${items} %}\n\t${}\n{% endfor %}", {
    label: "for",
    type: "snippet",
    detail: "snippet · loop",
    info: "Insert a for-loop block.",
  }),
  snippetCompletion("{% if ${condition} %}\n\t${}\n{% endif %}", {
    label: "if",
    type: "snippet",
    detail: "snippet · conditional",
    info: "Insert an if block.",
  }),
  snippetCompletion("{% if ${condition} %}\n\t${}\n{% else %}\n\t${}\n{% endif %}", {
    label: "ifelse",
    type: "snippet",
    detail: "snippet · conditional",
    info: "Insert an if/else block.",
  }),
  snippetCompletion("{{ ${expr} }}", {
    label: "var",
    type: "snippet",
    detail: "snippet · interpolation",
    info: "Insert a variable interpolation {{ … }}.",
  }),
  snippetCompletion("{# ${comment} #}", {
    label: "comment",
    type: "snippet",
    detail: "snippet · comment",
    info: "Insert a Jinja comment block {# … #}.",
  }),
  snippetCompletion("{% set ${name} = ${value} %}", {
    label: "set",
    type: "snippet",
    detail: "snippet · assignment",
    info: "Insert a {% set %} assignment.",
  }),
  snippetCompletion("{% macro ${name}(${args}) %}\n\t${}\n{% endmacro %}", {
    label: "macro",
    type: "snippet",
    detail: "snippet · macro",
    info: "Insert a macro definition.",
  }),
  snippetCompletion("{% block ${name} %}\n\t${}\n{% endblock %}", {
    label: "block",
    type: "snippet",
    detail: "snippet · inheritance",
    info: "Insert a named block.",
  }),
];

// Builtin Jinja2 filters (subset). Used after `|`. These are always available in
// every render mode (the backend does not register them — Jinja2 provides them).
export const BUILTIN_FILTERS: Completion[] = [
  { label: "default", type: "function", detail: "filter", info: "Use a fallback when the value is undefined. Example: {{ x | default('n/a') }}" },
  { label: "join", type: "function", detail: "filter", info: "Join a sequence with a separator. Example: {{ list | join(', ') }}" },
  { label: "length", type: "function", detail: "filter", info: "Number of items / characters. Example: {{ items | length }}" },
  { label: "count", type: "function", detail: "filter", info: "Alias of length." },
  { label: "sort", type: "function", detail: "filter", info: "Sort a sequence. Example: {{ items | sort }}" },
  { label: "reverse", type: "function", detail: "filter", info: "Reverse a sequence." },
  { label: "unique", type: "function", detail: "filter", info: "Remove duplicate items." },
  { label: "map", type: "function", detail: "filter", info: "Apply a filter/attribute to each item. Example: {{ users | map(attribute='name') | list }}" },
  { label: "select", type: "function", detail: "filter", info: "Keep items passing a test. Example: {{ nums | select('odd') | list }}" },
  { label: "reject", type: "function", detail: "filter", info: "Drop items passing a test." },
  { label: "selectattr", type: "function", detail: "filter", info: "Keep items whose attribute passes a test." },
  { label: "rejectattr", type: "function", detail: "filter", info: "Drop items whose attribute passes a test." },
  { label: "list", type: "function", detail: "filter", info: "Convert an iterable to a list." },
  { label: "first", type: "function", detail: "filter", info: "First item of a sequence." },
  { label: "last", type: "function", detail: "filter", info: "Last item of a sequence." },
  { label: "min", type: "function", detail: "filter", info: "Smallest item." },
  { label: "max", type: "function", detail: "filter", info: "Largest item." },
  { label: "sum", type: "function", detail: "filter", info: "Sum of a sequence." },
  { label: "upper", type: "function", detail: "filter", info: "Uppercase a string." },
  { label: "lower", type: "function", detail: "filter", info: "Lowercase a string." },
  { label: "capitalize", type: "function", detail: "filter", info: "Capitalize the first character." },
  { label: "title", type: "function", detail: "filter", info: "Title-case a string." },
  { label: "trim", type: "function", detail: "filter", info: "Strip surrounding whitespace." },
  { label: "replace", type: "function", detail: "filter", info: "Replace substrings. Example: {{ s | replace('a','b') }}" },
  { label: "truncate", type: "function", detail: "filter", info: "Truncate a string to a length." },
  { label: "indent", type: "function", detail: "filter", info: "Indent every line. Example: {{ text | indent(2) }}" },
  { label: "string", type: "function", detail: "filter", info: "Convert a value to a string." },
  { label: "int", type: "function", detail: "filter", info: "Convert a value to an integer." },
  { label: "float", type: "function", detail: "filter", info: "Convert a value to a float." },
  { label: "round", type: "function", detail: "filter", info: "Round a number. Example: {{ x | round(2) }}" },
  { label: "abs", type: "function", detail: "filter", info: "Absolute value." },
  { label: "tojson", type: "function", detail: "filter", info: "Serialize a value to JSON." },
];

// Fallback for the project/emulated filters when /capabilities has not loaded.
// At runtime these come from the backend (with per-mode availability and
// descriptions); this static list keeps the editor useful offline and in tests.
export const PROJECT_FILTERS_FALLBACK: Completion[] = [
  { label: "hash", type: "function", detail: "filter · project", info: "Hash a value with a hashlib algorithm (default sha256). Example: {{ hostname | hash('sha256') }}" },
  { label: "ipaddr", type: "function", detail: "filter · project", info: "ansible-like IP/network filter. Example: {{ '192.0.2.1/24' | ipaddr('network') }}. Queries: address, network, netmask, prefix, …" },
];

// Builtin Jinja tests (subset). Used after `is`.
export const TESTS: Completion[] = [
  { label: "defined", type: "function", detail: "test", info: "True if the variable is defined. Example: {% if x is defined %}" },
  { label: "undefined", type: "function", detail: "test", info: "True if the variable is undefined." },
  { label: "none", type: "function", detail: "test", info: "True if the value is None." },
  { label: "boolean", type: "function", detail: "test", info: "True if the value is a boolean." },
  { label: "number", type: "function", detail: "test", info: "True if the value is a number." },
  { label: "string", type: "function", detail: "test", info: "True if the value is a string." },
  { label: "mapping", type: "function", detail: "test", info: "True if the value is a mapping (dict)." },
  { label: "sequence", type: "function", detail: "test", info: "True if the value is a sequence." },
  { label: "iterable", type: "function", detail: "test", info: "True if the value can be iterated." },
  { label: "even", type: "function", detail: "test", info: "True if the integer is even." },
  { label: "odd", type: "function", detail: "test", info: "True if the integer is odd." },
  { label: "divisibleby", type: "function", detail: "test", info: "True if divisible by a number. Example: {% if n is divisibleby 3 %}" },
  { label: "in", type: "function", detail: "test", info: "True if the value is contained in a collection." },
  { label: "eq", type: "function", detail: "test", info: "Equality test." },
  { label: "ne", type: "function", detail: "test", info: "Inequality test." },
  { label: "gt", type: "function", detail: "test", info: "Greater-than test." },
  { label: "lt", type: "function", detail: "test", info: "Less-than test." },
];

// Fallback list of emulated ansible facts (ansible render mode), used when
// /capabilities has not loaded. At runtime the fact names come from the backend.
export const ANSIBLE_FACTS_FALLBACK: Completion[] = [
  { label: "ansible_facts", type: "variable", detail: "ansible", info: "Emulated, static host facts (ansible mode). User data overrides these." },
  { label: "ansible_hostname", type: "variable", detail: "ansible fact", info: "Emulated short hostname (ansible mode)." },
  { label: "ansible_fqdn", type: "variable", detail: "ansible fact", info: "Emulated fully-qualified domain name (ansible mode)." },
  { label: "ansible_distribution", type: "variable", detail: "ansible fact", info: "Emulated OS distribution name (ansible mode)." },
  { label: "ansible_default_ipv4", type: "variable", detail: "ansible fact", info: "Emulated default IPv4 info (ansible mode)." },
];
