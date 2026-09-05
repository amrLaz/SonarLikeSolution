using Microsoft.Extensions.Hosting;
using System.Diagnostics.CodeAnalysis;
using Up.France.Benefits.AspNetCore.Web;

namespace Up.France.Benefits.Api
{
    [ExcludeFromCodeCoverage]
    public class Program
    {
        public static void Main(string[] args)
        {
            HostBuilderCreator.Create<Startup>(args).Build().Run();
        }
    }
}








//using Azure.Core;
//using Azure.Identity;
//using Benefits.Api;
//using Benefits.Api.Services;
//using Mango.Services.CouponAPI.Extensions;
//using Microsoft.AspNetCore.Authentication.JwtBearer;
//using Microsoft.Azure.Cosmos;
//using Microsoft.OpenApi.Models;
//using Up.France.Benefits.Abstraction.Repositories;
//using Up.France.Benefits.Business;
//using Up.France.Benefits.Data;

//using Up.France.Benefits.Data.Repositories;

//var builder = WebApplication.CreateBuilder(args);


//// Add services to the container.

//builder.Services.AddControllers();
//// Learn more about configuring Swagger/OpenAPI at https://aka.ms/aspnetcore/swashbuckle
//builder.Services.AddEndpointsApiExplorer();
//builder.Services.AddSwaggerGen();



////builder.Services.AddSingleton((provider) =>
////{
////    TokenCredential credential = new DefaultAzureCredential(new DefaultAzureCredentialOptions());
////    var client = new CosmosClient(builder.Configuration["CosmosDbSettings:CosmosDbConectionUri"], credential);
////    return client;
////});

////builder.Services.AddScoped<IOperationRepository>((provider) =>
////{
////    var client = provider.GetService<CosmosClient>();

////    var container = client.GetContainer(builder.Configuration["CosmosDbSettings:DatabaseName"], "Operations");

////    return new OperationRepository(container);
////});

//builder.Services.AddData();
//builder.Services.AddBusiness();
////builder.Services.AddScoped<IOperationService, OperationService>();

//builder.Services.AddSwaggerGen(option =>
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

//builder.AddAppAuthetication();
//builder.Services.AddAuthorization();

//var app = builder.Build();
//app.UseErrorHandling();

//// Configure the HTTP request pipeline.
//if (app.Environment.IsDevelopment())
//{
//    app.UseSwagger();
//    app.UseSwaggerUI();
//}

//app.UseHttpsRedirection();
//app.UseAuthentication();
//app.UseAuthorization();

//app.MapControllers();


//app.Run();
