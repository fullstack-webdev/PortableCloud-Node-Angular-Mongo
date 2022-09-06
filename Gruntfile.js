module.exports = function (grunt) {
    // Project configuration.
    grunt.initConfig({
        pkg: grunt.file.readJSON('package.json'),
        jshint: {
            files: ['Gruntfile.js', 'frontend/src/**/*.js'],
            options: {
                // options here to override JSHint defaults
                globals: {
                    jQuery: true,
                    console: true,
                    module: true,
                    document: true
                }
            }
        },
        csslint: {
            strict: {
                options: {
                    import: 2
                },
                src: ['frontend/src/css/*.css']
            }
        },
        ngtemplates: {
            PCloudSyncServer: {
                cwd: 'frontend',
                src: 'src/**/*.html',
                dest: 'tmp/templates.js'
            }
        },
        concat: {
            options: {
                separator: '\n'
            },
            dist: {
                src: ['frontend/src/js/app.js', 'tmp/templates.js', 'frontend/src/**/*.js'],
                dest: 'frontend/build/<%= pkg.name %>.js'
            },
            css: {
                src: ['frontend/src/css/main.css', 'frontend/src/css/*.css'],
                dest: 'frontend/build/<%= pkg.name %>.css'
            }
        },
        bower_concat: {
            all: {
                dest: {
                    js: 'frontend/build/cloudfiles_bower.js',
                    css: 'frontend/build/cloudfiles_bower.css'
                },
                exclude: [
                    'jquery',
                    'angular'
                ],
                bowerOptions: {
                    relative: false
                },
                mainFiles: {
                    'bootswatch': ['paper/bootstrap.min.css']
                }
            }
        },
        cssmin: {
            options: {
                shorthandCompacting: false,
                roundingPrecision: -1
            },
            target: {
                files: [
                    {
                        src: "frontend/build/<%= pkg.name %>.css",
                        dest: "frontend/build/<%= pkg.name %>.min.css"
                    },
                    {
                        src: "frontend/build/cloudfiles_bower.css",
                        dest: "frontend/build/cloudfiles_bower.min.css"
                    }
                ]
            }
        },
        uglify: {
            options: {
                banner: '/* <%= pkg.name %> <%= grunt.template.today("yyyy-mm-dd") %> */\n',
                mangle: false
            },
            build: {
                files: {
                    'frontend/build/<%= pkg.name %>.min.js': 'frontend/build/<%= pkg.name %>.js',
                    'frontend/build/cloudfiles_bower.min.js': 'frontend/build/cloudfiles_bower.js'
                }
            }
        },
        watch: {
            js: {
                files: 'frontend/src/**/*.js',
                tasks: ['default']
            },
            html: {
                files: 'frontend/src/**/*.html',
                tasks: ['default']
            },
            css: {
                files: 'frontend/src/**/*.css',
                tasks: ['default']
            },
            options: {
                interrupt: true
            }
        }
    });

    // Load plugins
    grunt.loadNpmTasks('grunt-contrib-uglify');
    grunt.loadNpmTasks('grunt-contrib-jshint');
    grunt.loadNpmTasks('grunt-contrib-concat');
    grunt.loadNpmTasks('grunt-angular-templates');
    grunt.loadNpmTasks('grunt-contrib-cssmin');
    grunt.loadNpmTasks('grunt-contrib-csslint');
    grunt.loadNpmTasks('grunt-bower-concat');
    grunt.loadNpmTasks('grunt-contrib-watch');

    // Default task(s).
    grunt.registerTask('default', ['jshint', 'ngtemplates', 'concat', 'bower_concat', 'cssmin', 'uglify']);

};