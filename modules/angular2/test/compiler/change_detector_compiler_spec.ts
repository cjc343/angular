import {
  ddescribe,
  describe,
  xdescribe,
  it,
  iit,
  xit,
  expect,
  beforeEach,
  afterEach,
  AsyncTestCompleter,
  inject,
  beforeEachProviders
} from 'angular2/testing_internal';
import {provide} from 'angular2/src/core/di';

import {CONST_EXPR, stringify, IS_DART} from 'angular2/src/facade/lang';
import {MapWrapper} from 'angular2/src/facade/collection';

import {ChangeDetectionCompiler} from 'angular2/src/compiler/change_detector_compiler';

import {
  CompileDirectiveMetadata,
  CompileTypeMetadata
} from 'angular2/src/compiler/directive_metadata';
import {
  SourceModule,
  SourceExpression,
  SourceExpressions,
  moduleRef
} from 'angular2/src/compiler/source_module';

import {TemplateParser} from 'angular2/src/compiler/template_parser';

import {
  ChangeDetectorGenConfig,
  ChangeDetectionStrategy,
  ChangeDispatcher,
  DirectiveIndex,
  Locals,
  BindingTarget,
  ChangeDetector
} from 'angular2/src/core/change_detection/change_detection';

import {evalModule} from './eval_module';

import {TEST_PROVIDERS} from './test_bindings';
import {TestDispatcher, TestPipes} from './change_detector_mocks';
import {codeGenValueFn, codeGenExportVariable, MODULE_SUFFIX} from 'angular2/src/compiler/util';

// Attention: These module names have to correspond to real modules!
var THIS_MODULE_ID = 'angular2/test/compiler/change_detector_compiler_spec';
var THIS_MODULE_URL = `package:${THIS_MODULE_ID}${MODULE_SUFFIX}`;
var THIS_MODULE_REF = moduleRef(THIS_MODULE_URL);

export function main() {
  // Dart's isolate support is broken, and these tests will be obsolote soon with
  // https://github.com/angular/angular/issues/6270
  if (IS_DART) {
    return;
  }
  describe('ChangeDetectorCompiler', () => {
    beforeEachProviders(() => [
      TEST_PROVIDERS,
      provide(ChangeDetectorGenConfig,
              {useValue: new ChangeDetectorGenConfig(true, false, false)})
    ]);

    var parser: TemplateParser;
    var compiler: ChangeDetectionCompiler;
    beforeEachProviders(() => [
      provide(ChangeDetectorGenConfig,
              {useValue: new ChangeDetectorGenConfig(true, false, false)})
    ]);

    beforeEach(inject([TemplateParser, ChangeDetectionCompiler], (_parser, _compiler) => {
      parser = _parser;
      compiler = _compiler;
    }));

    describe('compileComponentRuntime', () => {
      function detectChanges(compiler: ChangeDetectionCompiler, template: string,
                             directives: CompileDirectiveMetadata[] = CONST_EXPR([])): string[] {
        var type =
            new CompileTypeMetadata({name: stringify(SomeComponent), moduleUrl: THIS_MODULE_URL});
        var parsedTemplate = parser.parse(template, directives, [], 'TestComp');
        var factories =
            compiler.compileComponentRuntime(type, ChangeDetectionStrategy.Default, parsedTemplate);
        return testChangeDetector(factories[0]);
      }

      it('should watch element properties', () => {
        expect(detectChanges(compiler, '<div [elProp]="someProp">'))
            .toEqual(['elementProperty(elProp)=someValue']);
      });
    });

    describe('compileComponentCodeGen', () => {
      function detectChanges(
          compiler: ChangeDetectionCompiler, template: string,
          directives: CompileDirectiveMetadata[] = CONST_EXPR([])): Promise<string[]> {
        var type =
            new CompileTypeMetadata({name: stringify(SomeComponent), moduleUrl: THIS_MODULE_URL});
        var parsedTemplate = parser.parse(template, directives, [], 'TestComp');
        var sourceExpressions =
            compiler.compileComponentCodeGen(type, ChangeDetectionStrategy.Default, parsedTemplate);
        var testableModule = createTestableModule(sourceExpressions, 0).getSourceWithImports();
        return evalModule(testableModule.source, testableModule.imports, null);
      }

      it('should watch element properties', inject([AsyncTestCompleter], (async) => {
           detectChanges(compiler, '<div [elProp]="someProp">')
               .then((value) => {
                 expect(value).toEqual(['elementProperty(elProp)=someValue']);
                 async.done();
               });

         }));
    });

  });
}

function createTestableModule(source: SourceExpressions,
                              changeDetectorIndex: number): SourceModule {
  var resultExpression =
      `${THIS_MODULE_REF}testChangeDetector(([${source.expressions.join(',')}])[${changeDetectorIndex}])`;
  var testableSource = `${source.declarations.join('\n')}
  ${codeGenValueFn(['_'], resultExpression, '_run')};
  ${codeGenExportVariable('run')}_run;`;
  return new SourceModule(null, testableSource);
}

export function testChangeDetector(changeDetectorFactory: Function): string[] {
  var dispatcher = new TestDispatcher([], []);
  var cd = changeDetectorFactory();
  var ctx = new SomeComponent();
  ctx.someProp = 'someValue';
  var locals = new Locals(null, MapWrapper.createFromStringMap({'someVar': null}));
  cd.hydrate(ctx, locals, dispatcher, new TestPipes());
  cd.detectChanges();
  return dispatcher.log;
}

class SomeComponent {
  someProp: string;
}
