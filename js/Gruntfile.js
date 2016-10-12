module.exports = function(grunt) {
    require("load-grunt-tasks")(grunt); // npm install --save-dev load-grunt-tasks

    grunt.initConfig({
        "babel": {
            options: {
                sourceMap: true,
                presets: ["es2015"]
            },
            dist: {
                files: [
                    {
                        expand: true,
                        dest: "dist/",
                        cwd: "src/",
                        src: ["*.js"]
                    }
                ]
            }
        }
    });

    grunt.registerTask("default", ["babel"]);
};
