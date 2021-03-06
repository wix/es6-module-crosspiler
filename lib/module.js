
var profile = require('debug')('es6-module-crosspiler:profile')
var memo = require('memorizer')

module.exports = Module

// for ast = x.transform(ast) recast usage
Module.transform = function (ast, options) {
  return new Module(ast, options).transform()
}

// get the dependency names of a module
// to do: think of a good name for a property
// instead of a constructor method
Module.dependenciesOf = function (mod) {
  // if it's an AST
  if (!(mod instanceof Module)) mod =  new Module(mod)
  // it already has the dependencies
  return mod.imports.map(toNodeSource)
    .concat(mod.requires.map(toFirstArgumentValue))
}

function toNodeSource(node) {
  return node.source.value
}

function toFirstArgumentValue(node) {
  return node.arguments[0].value
}

function Module(ast, options) {
  if (!(this instanceof Module)) return new Module(ast, options)

  this.ast = ast
  this.options = options || Object.create(null)

  this.dependencies = this.options.dependencies || Object.create(null)
  this.renames = this.options.renames || Object.create(null)
  this.renamed = Object.create(null)
}

Module.prototype.inspect = function () {
  return this.toJSON()
}

Module.prototype.toJSON = function () {
  return {
    type: this.type,
    default: this.default,
    dependencies: this.dependencies,
    renames: this.renames,
  }
}

Module.prototype.rename = function (from, to) {
  this.renames[from] = to
  return this
}

Module.prototype.set = function (name, obj) {
  this.dependencies[name] = obj
  return this
}

Module.prototype.lookup = function (name) {
  return this.dependencies[name] || this.renamed[name]
}

/**
 * Check whether a module is an ES6 module
 * by checking declarations at the top level scope.
 * If it's not an ES6 module, you can assume that
 * this module is a CommonJS module within this context.
 */

Module.prototype.isModule = function () {
  return !!(this.imports.length || this.exports.length)
}

memo(Module.prototype, 'type', function () {
  if (this.isModule()) return 'module'
  if (this.requires.length) return 'commonjs'
  if (this.hasCommonExports) return 'commonjs'
  return null
})

/**
 * Checks whether an `export default` exists.
 * The value or contents of it is not particularly important.
 * We just need to know whether to do `require('module')` or
 * `require('module').default`.
 */

Module.prototype.exportsDefault = function () {
  if (this.type !== 'module') return false
  return this.exports.filter(hasDefault).length === 1
}

function hasDefault(node) {
  return node.default
}

memo(Module.prototype, 'default', function () {
  return this.exportsDefault()
})

/**
 * A variable version of an import declaration.
 * You can change this if you'd like.
 */

Module.prototype.sourceToVariableName = function (str) {
  return '__$mod_' + str.replace(/[^\w]/g, '_')
}

/**
 * Transpiles an ES6 module to CommonJS,
 * ES6-module-transpiler style.
 */

Module.prototype.transform = function () {
  profile('beginning transform')
  var module = this.type === 'module'
  // rewrite all the things
  this.renameRequires()
  profile('renamed requires')
  if (module) {
    this.renameImports()
    profile('renamed imports')
  }

  // handle any require statements first
  this.defaultifyRequires()
  profile('defaultified requires')
  if (!module) return this.ast
  // handle imports, which go below exports
  this.buildRequires()
  profile('built requires')
  this.removeImports()
  profile('removed imports')
  // handle exports, which go at the top
  this.buildExports()
  profile('built exports')
  this.removeExports()
  profile('removed exports')
  // build the import references
  this.buildReferences()
  profile('built references')
  return this.ast
}
