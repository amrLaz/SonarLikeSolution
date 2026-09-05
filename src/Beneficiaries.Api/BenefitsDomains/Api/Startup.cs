using Up.France.Benefits.Data;
using Up.France.Benefits.Business;
using Microsoft.OpenApi.Models;
//using Azure.Core;
//using Azure.Identity;
using Benefits.Api;
//using Benefits.Api.Services;
//using Mango.Services.CouponAPI.Extensions;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Diagnostics.HealthChecks;
using HealthChecks.UI.Client;
using Up.Frence.Benefits.Api.Health;
using Up.France.Benefits.AspNetCore.Web;
using Microsoft.AspNetCore.Mvc.ApiExplorer;
using System.Reflection;
using Swashbuckle.AspNetCore.SwaggerGen;
using Microsoft.Extensions.Options;
using Gestion.Compte.MoveUp;

//using Microsoft.Azure.Cosmos;
//using Microsoft.OpenApi.Models;
//using Up.France.Benefits.Abstraction.Repositories;
//using Up.France.Benefits.Business;
//using Up.France.Benefits.Data;
//using Microsoft.AspNetCore.Mvc.ApiExplorer;
//using System.Reflection;
//using Up.NCommon.WebApi.WithVersion;
//using Microsoft.Extensions.Options;
//using Swashbuckle.AspNetCore.SwaggerGen;
//using Up.France.Benefits.AspNetCore.Web;
//using Up.France.Benefits.Configuration;

namespace Up.France.Benefits.Api
{
    public class Startup
    {
        public Startup(IConfiguration configuration)
        {
            Configuration = configuration;
        }

        public IConfiguration Configuration { get; }

        public void ConfigureServices(IServiceCollection services)
        {
            // Add CORS without AllowCredentials
            services.AddCors(options =>
            {
                options.AddPolicy("AllowAll", builder =>
                {
                    builder
                        .AllowAnyOrigin()
                        .AllowAnyMethod()
                        .AllowAnyHeader();
                });
            });


            services.AddControllers().AddNewtonsoftJson();
            services.ConfigureApiVersioning<CampaignPublicSwaggerDoc>(Path.Combine(AppContext.BaseDirectory, $"{Assembly.GetExecutingAssembly().GetName().Name}.xml"));

            //Add Data layer dependencies 
            services.AddData();

            //Add Business layer dependencies 
            services.AddBusiness();

            //
            services.ConfigureGestionCompteMoveUpClient();

            //services.AddSwaggerGen(option =>
            //{
            //    option.AddSecurityDefinition(name: JwtBearerDefaults.AuthenticationScheme, securityScheme: new OpenApiSecurityScheme
            //    {
            //        Name = "Authorization",
            //        Description = "Enter the Bearer Authorization string as following: `Bearer Generated-JWT-Token`",
            //        In = ParameterLocation.Header,
            //        Type = SecuritySchemeType.ApiKey,
            //        Scheme = "Bearer"
            //    });
            //    option.AddSecurityRequirement(new OpenApiSecurityRequirement
            //    {
            //        {
            //            new OpenApiSecurityScheme
            //            {
            //                Reference= new OpenApiReference
            //                {
            //                    Type=ReferenceType.SecurityScheme,
            //                    Id=JwtBearerDefaults.AuthenticationScheme
            //                }
            //            }, new string[]{}
            //        }
            //    });
            //});

            services.AddHealthChecks()
                .AddCheck<CosmosDBHealthCheck>("DbConnection");

        }

        public void Configure(IApplicationBuilder app, IWebHostEnvironment env, IApiVersionDescriptionProvider provider)
        {
            app.UseErrorHandling();

            if (env.IsDevelopment())
            {
                app.ConfigureSwagger(provider);

            }

            app.UseHttpsRedirection();


            app.UseRouting();
            // Add Cors
            app.UseCors("AllowAll");

            app.UseAuthentication();

            app.UseAuthorization();

            app.UseEndpoints(endpoints =>
            {
                endpoints.MapHealthChecks("/health", new HealthCheckOptions
                {
                   ResponseWriter = UIResponseWriter.WriteHealthCheckUIResponse
                });
                endpoints.MapControllers();
            });


        }


        public class CampaignPublicSwaggerDoc : IConfigureOptions<SwaggerGenOptions>
        {
            readonly IApiVersionDescriptionProvider _provider;
            readonly string path = "https://up-group.slack.com";

            public CampaignPublicSwaggerDoc(IApiVersionDescriptionProvider provider) =>
                this._provider = provider;

            public void Configure(SwaggerGenOptions options)
            {
                foreach (var description in _provider.ApiVersionDescriptions)
                {
                    options.SwaggerDoc(
                      description.GroupName,
                        new OpenApiInfo()
                        {
                            Title = "Up.France.Benefits.Api",
                            Version = description.ApiVersion.ToString(),
                            Description = "Welcome to the Up France Benefits API",
                            Contact = new OpenApiContact
                            {
                                Name = "Up Fabrique Digitale Team",
                                Email = "fabriquedigitale@up.coop",
                                Url = new Uri(path)
                            }
                        });
                }
            }
        }

    }
}
