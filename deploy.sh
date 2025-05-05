ibmcloud ce app update --name cf-bv-api \
  --build-source https://github.com/adam-stewart-elixirr/cf-bv-api \
  --strategy buildpacks \
  --env-from-secret jwt-secret \
  --env-from-secret cos-credentials

  
ibmcloud ce secret create --name cos-credentials \
  --from-literal COS_INSTANCE_ID=crn:v1:bluemix:public:cloud-object-storage:global:a/c2f15c5e01ca4e87baf9932ec2a630a8:e4813fa0-56ba-429c-9d7c-784ed87fabb7:: \
  --from-literal COS_ENDPOINT=https://s3.us-south.cloud-object-storage.appdomain.cloud \
  --from-literal COS_BUCKET_NAME=cf-bv-api-users \
  --from-literal COS_LOCATION=us-south-standard
