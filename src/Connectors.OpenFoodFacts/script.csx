using System;
using System.Net;
using System.Net.Http;
using System.Threading.Tasks;
using Newtonsoft.Json.Linq;

public class Script : ScriptBase
{
    private const string UserAgent = "TALXIS-Lab-WarehousePicking/1.0 (+https://github.com/TALXIS/lab)";

    public override async Task<HttpResponseMessage> ExecuteAsync()
    {
        if (string.Equals(this.Context.OperationId, "GetProductImage", StringComparison.OrdinalIgnoreCase))
        {
            return await GetProductImageAsync().ConfigureAwait(false);
        }

        if (string.Equals(this.Context.OperationId, "GetProductByBarcode", StringComparison.OrdinalIgnoreCase))
        {
            return await GetProductByBarcodeAsync().ConfigureAwait(false);
        }

        return new HttpResponseMessage(HttpStatusCode.BadRequest)
        {
            Content = CreateJsonContent("{\"message\":\"Unsupported operation\"}")
        };
    }

    private async Task<HttpResponseMessage> GetProductByBarcodeAsync()
    {
        this.Context.Request.Headers.UserAgent.ParseAdd(UserAgent);
        var response = await this.Context.SendAsync(this.Context.Request, this.CancellationToken)
            .ConfigureAwait(false);

        if (!response.IsSuccessStatusCode)
        {
            return response;
        }

        var body = JObject.Parse(await response.Content.ReadAsStringAsync().ConfigureAwait(false));
        if ((int?)body["status"] != 1)
        {
            response.StatusCode = HttpStatusCode.NotFound;
            response.Content = CreateJsonContent("{\"message\":\"No product found for this barcode\"}");
            return response;
        }

        var product = body["product"];
        var flattened = new JObject
        {
            ["ean"] = (string)body["code"],
            ["name"] = (string)product["product_name"],
            ["brand"] = (string)product["brands"],
            ["quantity"] = (string)product["quantity"],
            ["imageUrl"] = (string)product["image_url"]
        };
        response.Content = CreateJsonContent(flattened.ToString());
        return response;
    }

    private async Task<HttpResponseMessage> GetProductImageAsync()
    {
        var imageUrl = GetQueryParameter(this.Context.Request.RequestUri, "imageUrl");
        if (string.IsNullOrWhiteSpace(imageUrl))
        {
            return new HttpResponseMessage(HttpStatusCode.BadRequest)
            {
                Content = CreateJsonContent("{\"message\":\"imageUrl query parameter is required\"}")
            };
        }

        this.Context.Request.RequestUri = new Uri(imageUrl);
        this.Context.Request.Headers.UserAgent.ParseAdd(UserAgent);
        return await this.Context.SendAsync(this.Context.Request, this.CancellationToken)
            .ConfigureAwait(false);
    }

    // HttpUtility is not available in the connector custom-code runtime.
    private static string GetQueryParameter(Uri requestUri, string name)
    {
        foreach (var pair in requestUri.Query.TrimStart('?').Split('&'))
        {
            var parts = pair.Split(new[] { '=' }, 2);
            if (parts.Length == 2 && Uri.UnescapeDataString(parts[0]) == name)
            {
                return Uri.UnescapeDataString(parts[1].Replace("+", " "));
            }
        }

        return null;
    }
}
